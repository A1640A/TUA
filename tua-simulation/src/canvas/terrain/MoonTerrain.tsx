'use client';
import { useRef, useMemo, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useLoader } from '@react-three/fiber';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

/**
 * MoonTerrain v2 — NASA displacement map driven spherical lunar surface.
 *
 * Key design decisions:
 *  - Uses a large SphereGeometry (cap only) so the surface has a natural
 *    planetary curve. Only the top ~quarterof the sphere is visible; a
 *    high radius (SPHERE_RADIUS) keeps the curvature gentle.
 *  - The NASA heightmap ("lunar-displacement.jpg") is loaded via THREE.TextureLoader
 *    and bound as `displacementMap` on a MeshStandardMaterial.
 *  - Vertex colours from the procedural terrain store are still applied ON TOP
 *    so the A* cost visualisation layer is preserved.
 *  - A ref-forwarded `getTerrainHeight(wx, wz)` raycaster helper is exported
 *    so the rover animation hook can snap the rover to the actual GPU surface.
 *
 * Coordinate system reminder:
 *   World X ∈ [-TERRAIN_SCALE/2, TERRAIN_SCALE/2]
 *   World Z ∈ [-TERRAIN_SCALE/2, TERRAIN_SCALE/2]
 *   World Y = elevation (up)
 */

// ─── Geometry constants ───────────────────────────────────────────────────────
/** Large sphere radius — big enough that the surface feels nearly flat but curved. */
const SPHERE_RADIUS = 400;
/** Angular half-width of the visible cap (radians).  π/9 ≈ 20° gives a cap
 *  that comfortably covers TERRAIN_SCALE units at SPHERE_RADIUS. */
const CAP_HALF_ANGLE = Math.PI / 9;
/** Number of longitudinal / latitudinal segments — must be high for displacement. */
const SEG = 512;

/** How many Three.js units the displacement map raises/lowers the surface. */
const DISPLACEMENT_SCALE = 4.5;

// ─── Utility: bilinear sample of the procedural heightMap ────────────────────
function sampleHeight(
  heightMap: Float32Array | readonly number[],
  wx: number, wz: number,
): number {
  const halfS = TERRAIN_SCALE / 2;
  const u = Math.max(0, Math.min(1, (wx + halfS) / TERRAIN_SCALE));
  const v = Math.max(0, Math.min(1, (wz + halfS) / TERRAIN_SCALE));
  const gx = u * (GRID_SIZE - 1);
  const gz = v * (GRID_SIZE - 1);
  const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, GRID_SIZE - 1);
  const z0 = Math.floor(gz), z1 = Math.min(z0 + 1, GRID_SIZE - 1);
  const fx = gx - x0, fz = gz - z0;
  const h00 = heightMap[z0 * GRID_SIZE + x0] ?? 0;
  const h10 = heightMap[z0 * GRID_SIZE + x1] ?? 0;
  const h01 = heightMap[z1 * GRID_SIZE + x0] ?? 0;
  const h11 = heightMap[z1 * GRID_SIZE + x1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

// ─── Public ref handle ────────────────────────────────────────────────────────
export interface MoonTerrainHandle {
  /** Sample approximate world-space Y for a given (worldX, worldZ) position. */
  getTerrainHeight: (wx: number, wz: number) => number;
}

// ─── Component ────────────────────────────────────────────────────────────────
const MoonTerrain = forwardRef<MoonTerrainHandle>(function MoonTerrain(_props, fwdRef) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Store selectors
  const terrain          = useTerrainStore(s => s.terrain);
  const placementMode    = useSimulationStore(s => s.placementMode);
  const setWaypoint      = useSimulationStore(s => s.setWaypoint);
  const placingObstacle  = useObstacleStore(s => s.placingObstacle);
  const addObstacle      = useObstacleStore(s => s.addObstacle);
  const selectedVariant  = useObstacleStore(s => s.selectedVariant);
  const setPlacingObstacle = useObstacleStore(s => s.setPlacingObstacle);

  // ── Displacement texture ───────────────────────────────────────────────────
  const displacementMap = useLoader(THREE.TextureLoader, '/lunar-displacement.jpg');
  useMemo(() => {
    if (!displacementMap) return;
    displacementMap.wrapS = THREE.RepeatWrapping;
    displacementMap.wrapT = THREE.RepeatWrapping;
    // No repeat — the whole map covers the whole terrain
    displacementMap.repeat.set(1, 1);
  }, [displacementMap]);

  // ── Geometry: spherical cap ────────────────────────────────────────────────
  // We build a full sphere but position the mesh so its north-pole faces up.
  // For rendering we use a sphere with many segments; Three.js SphereGeometry
  // already covers the whole sphere — we clip the view with the camera.
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(
      SPHERE_RADIUS,
      SEG,
      SEG,
      0,              // phiStart
      Math.PI * 2,    // phiLength (full circle)
      0,              // thetaStart (from north pole)
      CAP_HALF_ANGLE, // thetaLength (just the cap)
    );
    return geo;
  }, []);

  // ── Vertex-colour pass from procedural terrain ─────────────────────────────
  useEffect(() => {
    if (!terrain || !geometry) return;

    const pos   = geometry.attributes.position as THREE.BufferAttribute;
    const count = pos.count;

    let colBuf = geometry.attributes.color as THREE.BufferAttribute | undefined;
    if (!colBuf || colBuf.count !== count) {
      colBuf = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute('color', colBuf);
    }

    const flatColor  = new THREE.Color('#6e7a8a');
    const slopeColor = new THREE.Color('#b07850');
    const tmp        = new THREE.Color();

    for (let i = 0; i < count; i++) {
      // Map sphere-surface UV (from [0,1]) back to grid index — approximate
      const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
      const u = uvAttr ? (uvAttr.getX(i)) : 0;
      const v = uvAttr ? (uvAttr.getY(i)) : 0;
      const gx = Math.max(0, Math.min(GRID_SIZE - 1, Math.round(u * (GRID_SIZE - 1))));
      const gz = Math.max(0, Math.min(GRID_SIZE - 1, Math.round((1 - v) * (GRID_SIZE - 1))));
      const idx = gz * GRID_SIZE + gx;
      const s = Math.min(terrain.slopeMap[idx] ?? 0, 1);
      tmp.lerpColors(flatColor, slopeColor, s * 2.2);
      colBuf.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    colBuf.needsUpdate = true;
    // NOTE: we do NOT re-displace vertices here — the GPU displacement map
    //       handles that in the shader.  computeVertexNormals() is still useful
    //       for the vertex-colour blending.
    geometry.computeVertexNormals();
  }, [terrain, geometry]);

  // ── Material ───────────────────────────────────────────────────────────────
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors:    true,
    displacementMap,
    displacementScale: DISPLACEMENT_SCALE,
    roughness:       0.95,
    metalness:       0.04,
    color:           new THREE.Color('#80889a'),
  }), [displacementMap]);

  // ── Public handle: getTerrainHeight (CPU-side approximation) ───────────────
  // The GPU displacement is approximated on the CPU using the procedural
  // heightMap stored in Zustand (which drives the same elevation visually).
  useImperativeHandle(fwdRef, () => ({
    getTerrainHeight(wx: number, wz: number): number {
      if (!terrain?.heightMap) return 0;
      const h = sampleHeight(terrain.heightMap, wx, wz);
      // Sphere curvature contribution at the given radius offset from centre
      const dSq = (wx * wx + wz * wz) / (SPHERE_RADIUS * SPHERE_RADIUS);
      const sphereY = SPHERE_RADIUS * (1 - Math.sqrt(Math.max(0, 1 - dSq))) * -1;
      return h * TERRAIN_HEIGHT_SCALE + sphereY;
    },
  }), [terrain]);

  // ── Coordinate mapping ─────────────────────────────────────────────────────
  const worldToGrid = (wx: number, wz: number) => ({
    x: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((wx / TERRAIN_SCALE + 0.5) * GRID_SIZE))),
    z: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((wz / TERRAIN_SCALE + 0.5) * GRID_SIZE))),
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const grid = worldToGrid(e.point.x, e.point.z);
    if (placementMode) {
      setWaypoint(placementMode, grid);
    } else if (placingObstacle) {
      addObstacle(grid, selectedVariant, terrain?.heightMap ?? null);
      setPlacingObstacle(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementMode, placingObstacle, selectedVariant, terrain]);

  const crosshair = placementMode || placingObstacle;

  // ── Mesh transform: rotate sphere so its north-pole faces +Y ──────────────
  // SphereGeometry starts at the north pole (0 thetaStart) which is at +Y
  // by default — no extra rotation needed.  We translate DOWN by SPHERE_RADIUS
  // so the cap top sits at Y=0.
  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[0, -SPHERE_RADIUS, 0]}
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
