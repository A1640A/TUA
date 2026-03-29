'use client';
import { useRef, useMemo, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useLoader } from '@react-three/fiber';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';
import { getHeightAt } from '@/lib/terrainSampler';

/**
 * MoonTerrain v3 — Single source of truth for both visuals and navigation.
 *
 * Architecture fix (v2 → v3):
 *  v2 used SphereGeometry + GPU displacementMap.  This created a fundamental
 *  mismatch: the rover and route were positioned using the *procedural* CPU
 *  heightMap while the *visual* surface was driven by the NASA texture on the
 *  GPU — two completely independent elevation sources, so the rover appeared
 *  to float or pass through craters.
 *
 *  v3 solution:
 *  1. Return to PlaneGeometry, same grid as the heightMap (GRID_SIZE×GRID_SIZE).
 *  2. Set vertex Y from the procedural heightMap directly in JS → visual surface
 *     now MATCHES the navigation data exactly.
 *  3. Apply the NASA lunar-displacement.jpg as a COLOR texture (map property)
 *     blended with the vertex-colour slope layer — adds photographic realism
 *     without misaligning the height data.
 *  4. Add a subtle CPU-baked sphere curvature correction to each vertex so the
 *     horizon looks gently curved (same formula used by the rover hook).
 *  5. Export getTerrainHeight() via ref — now returns the EXACT same value
 *     used to build the geometry, guaranteeing rover/terrain alignment.
 *
 * Coordinate system:
 *   World X ∈ [-TERRAIN_SCALE/2, +TERRAIN_SCALE/2]
 *   World Z ∈ [-TERRAIN_SCALE/2, +TERRAIN_SCALE/2]
 *   World Y = elevation (up)
 */

// ─── Constants ─────────────────────────────────────────────────────
/**
 * Virtual sphere radius for the planetary-curve bake.
 * Curvature dip at terrain edge = TERRAIN_SCALE²/(8·R).
 * With TERRAIN_SCALE=80:
 *   R=200: 80²/1600 = 4.00 units — DANGEROUS: objects sink underground.
 *   R=580: 80²/4640 ≈ 1.38 units — clearly visible horizon bow, safe.
 *   R=900: 80²/7200 ≈ 0.89 units — very subtle.
 * R=580 chosen: strong visual impact without geometry conflicts.
 *
 * IMPORTANT: The curvature is applied ONLY through getWorldY() (vertex Y offset).
 * The mesh has NO rotation-x tilt. This guarantees that the visual surface and
 * all physics/navigation calculations use the IDENTICAL coordinate frame.
 */
const SPHERE_RADIUS = 580;
/**
 * Rover chassis clearance above raw vertex Y (world units).
 * Wheel cylinder radius = 0.22. We add 0.06 clearance so the
 * tyre tread (not the hub) is flush with the surface.
 */
export const TERRAIN_GROUND_OFFSET = 0.28;


// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * getWorldY — backward-compatibility alias for getHeightAt.
 *
 * All height sampling is now delegated to terrainSampler.ts which is the
 * single source of truth.  Any code that still imports getWorldY from here
 * will continue to work without modification.
 */
export function getWorldY(
  heightMap: Float32Array | readonly number[],
  wx: number, wz: number,
): number {
  return getHeightAt(heightMap, wx, wz);
}

// ─── Ref handle ────────────────────────────────────────────────────────────────
export interface MoonTerrainHandle {
  /** Exact world-Y at (wx, wz), guaranteed to match visual geometry. */
  getTerrainHeight: (wx: number, wz: number) => number;
}

// ─── WorldToGrid helper (also used by parent) ─────────────────────────────────
function worldToGrid(wx: number, wz: number) {
  return {
    x: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((wx / TERRAIN_SCALE + 0.5) * GRID_SIZE))),
    z: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((wz / TERRAIN_SCALE + 0.5) * GRID_SIZE))),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
const MoonTerrain = forwardRef<MoonTerrainHandle>(function MoonTerrain(_props, fwdRef) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Store selectors
  const terrain            = useTerrainStore(s => s.terrain);
  const deformTerrain      = useTerrainStore(s => s.deformTerrain);
  const placementMode      = useSimulationStore(s => s.placementMode);
  const setWaypoint        = useSimulationStore(s => s.setWaypoint);
  const placingObstacle    = useObstacleStore(s => s.placingObstacle);
  const addObstacle        = useObstacleStore(s => s.addObstacle);
  const selectedVariant    = useObstacleStore(s => s.selectedVariant);
  const setPlacingObstacle = useObstacleStore(s => s.setPlacingObstacle);

  // ── NASA lunar texture — used as colour/albedo overlay only ───────────────
  const lunarTex = useLoader(THREE.TextureLoader, '/lunar-displacement.jpg');
  useMemo(() => {
    if (!lunarTex) return;
    lunarTex.wrapS = lunarTex.wrapT = THREE.RepeatWrapping;
    lunarTex.repeat.set(1, 1);
    lunarTex.anisotropy = 16;  // maximum filter quality for oblique views
    lunarTex.minFilter = THREE.LinearMipmapLinearFilter;
    lunarTex.magFilter = THREE.LinearFilter;
  }, [lunarTex]);

  // ── Base geometry — PlaneGeometry aligned with heightMap grid ─────────────
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SCALE, TERRAIN_SCALE,
      GRID_SIZE - 1, GRID_SIZE - 1,
    );
    geo.rotateX(-Math.PI / 2); // lay flat in XZ plane
    return geo;
  }, []);

  // ── Vertex update: Y from heightMap + curvature, colours from slope ────────
  useEffect(() => {
    if (!terrain || !geometry) return;

    const pos    = geometry.attributes.position as THREE.BufferAttribute;
    const uvAttr = geometry.attributes.uv      as THREE.BufferAttribute;
    const count  = pos.count;

    // Ensure colour buffer
    let colBuf = geometry.attributes.color as THREE.BufferAttribute | undefined;
    if (!colBuf || colBuf.count !== count) {
      colBuf = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute('color', colBuf);
    }

    // ── Four-zone lunar colour palette ────────────────────────────────────
    // Based on Hapke (1981) photometric model for mature lunar regolith:
    //  Zone 1 — flat mare regolith:   cool blue-grey   (#606878)
    //  Zone 2 — steep slope / rock:   warm ochre-tan   (#907258)
    //  Zone 3 — crater floor basalt:  very dark brown  (#1e1a16)
    //  Zone 4 — rim ejecta highlight: light grey-white (#aabbc8)
    const regolithColor  = new THREE.Color('#606878');
    const slopeColor     = new THREE.Color('#907258');
    const craterFloor    = new THREE.Color('#1e1a16');
    const rimHighlight   = new THREE.Color('#aabbc8');
    const tmp            = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const u  = uvAttr.getX(i);
      const v  = uvAttr.getY(i);
      const wx = (u - 0.5) * TERRAIN_SCALE;
      const wz = (0.5 - v) * TERRAIN_SCALE;

      // Bake vertex Y via terrainSampler.getHeightAt (single source of truth)
      const wy = getHeightAt(terrain.heightMap, wx, wz);
      pos.setY(i, wy);

      // Grid sample indices
      const gx  = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(u * (GRID_SIZE - 1))));
      const gz  = Math.max(0, Math.min(GRID_SIZE - 1, Math.round((1 - v) * (GRID_SIZE - 1))));
      const idx = gz * GRID_SIZE + gx;

      const slope = Math.min((terrain.slopeMap[idx]  ?? 0) * 3.2, 1.0);
      const crat  = Math.min((terrain.craterMap[idx]  ?? 0),       1.0);

      // Layer 1: flat regolith → slope rock
      tmp.lerpColors(regolithColor, slopeColor, slope);
      // Layer 2: darken crater interior (deep bowl)
      if (crat > 0.55) tmp.lerpColors(tmp, craterFloor, (crat - 0.55) / 0.45);
      // Layer 3: brighten near-rim zone (ejecta + fresh material)
      if (crat > 0.15 && crat < 0.50) {
        const rimT = 1 - Math.abs((crat - 0.32) / 0.18);
        tmp.lerpColors(tmp, rimHighlight, Math.max(0, rimT) * 0.35);
      }

      colBuf.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }

    pos.needsUpdate    = true;
    colBuf.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [terrain, geometry]);

  // ── Material: vertex colours + NASA photo overlay ─────────────────────────
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness:    0.92,   // slightly less rough for sharper specular on rim
      metalness:    0.02,
      // Vertex colours drive the main albedo; NASA texture adds micro-detail
      color:        new THREE.Color('#888ea0'),
    });
    if (lunarTex) {
      mat.map = lunarTex;
    }
    return mat;
  }, [lunarTex]);

  // ── Ref handle — returns exact vertex height ───────────────────────────────
  useImperativeHandle(fwdRef, () => ({
    getTerrainHeight(wx: number, wz: number): number {
      if (!terrain?.heightMap) return 0;
      return getHeightAt(terrain.heightMap, wx, wz);
    },
  }), [terrain]);

  // ── Click / hover interaction ──────────────────────────────────────────────
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const grid = worldToGrid(e.point.x, e.point.z);
    if (placementMode) {
      setWaypoint(placementMode, grid);
    } else if (placingObstacle) {
      addObstacle(grid, selectedVariant, terrain?.heightMap ?? null, deformTerrain);
      setPlacingObstacle(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementMode, placingObstacle, selectedVariant, terrain, deformTerrain]);

  const crosshair = placementMode || placingObstacle;

  // UX-03 FIX: Ensure cursor is restored if component unmounts while
  // crosshair mode is active (e.g., terrain regeneration during placement).
  useEffect(() => {
    return () => { document.body.style.cursor = 'auto'; };
  }, []);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow
      onClick={handleClick}
      onPointerEnter={() => { if (crosshair) document.body.style.cursor = 'crosshair'; }}
      onPointerLeave={() => { document.body.style.cursor = 'auto'; }}
    />
  );
});

MoonTerrain.displayName = 'MoonTerrain';
export default MoonTerrain;
