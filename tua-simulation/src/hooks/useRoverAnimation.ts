'use client';
import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { ROVER_SPEED, TERRAIN_HEIGHT_SCALE, GRID_SIZE, TERRAIN_SCALE } from '@/lib/constants';

/**
 * Drives the rover along the CatmullRom spline each animation frame.
 *
 * v2 changes — terrain height snapping:
 * - The rover's Y position is now determined by sampling the procedural
 *   heightMap at the rover's current (X, Z) world coordinate.
 * - A small constant ROVER_GROUND_OFFSET lifts the rover chassis just above
 *   the surface to avoid z-fighting.
 * - Roll / pitch of the rover are approximated by sampling X+dx and Z+dz
 *   neighbours and computing the local surface normal, then tilting the
 *   rover group accordingly.
 *
 * The displacement-map sphere also introduces a very slight downward curvature.
 * We approximate this on the CPU using the same formula as MoonTerrainHandle
 * (see terrain/MoonTerrain.tsx) so the rover does not float above the horizon.
 */

/** Sphere radius must match the value in MoonTerrain.tsx */
const SPHERE_RADIUS = 400;
/** How far above the terrain surface the rover chassis bottom sits. */
const ROVER_GROUND_OFFSET = 0.3;
/** Small delta used to finite-difference the local surface normal. */
const NORMAL_DELTA = 0.6;

// ─── Bilinear heightmap sample (CPU-side, mirrors MoonTerrain logic) ──────────
function sampleGridHeight(
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

/**
 * Full terrain height at world (wx, wz):
 *  = procedural heightmap contribution  +  sphere curvature offset
 *
 * The sphere is centred at Y = -SPHERE_RADIUS and faces upward; the downward
 * dip at horizontal distance r from the centre is:
 *   Δy = SPHERE_RADIUS - sqrt(SPHERE_RADIUS² - r²)   (negative, i.e. dips down)
 */
function getFullTerrainY(
  heightMap: Float32Array | readonly number[],
  wx: number, wz: number,
): number {
  const procH = sampleGridHeight(heightMap, wx, wz) * TERRAIN_HEIGHT_SCALE;
  const r2 = (wx * wx + wz * wz);
  const sphereDip = -(SPHERE_RADIUS - Math.sqrt(Math.max(0, SPHERE_RADIUS * SPHERE_RADIUS - r2)));
  return procH + sphereDip;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drives the rover along the CatmullRom spline each animation frame.
 *
 * @param curve - CatmullRom spline built from the route API response.
 * @returns `{ animate }` — call inside `useFrame` every tick.
 */
export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef  = useRef(0);
  const prevPosRef   = useRef<THREE.Vector3 | null>(null);
  const { setRoverState, setStatus, status, routeResult } = useSimulationStore();
  const terrain = useTerrainStore(s => s.terrain);

  // ── Reset progress whenever the route changes ──────────────────────────────
  useEffect(() => {
    progressRef.current = 0;
    prevPosRef.current  = null;
  }, [routeResult]);

  const animate = useCallback(() => {
    if (!curve || status !== 'animating') return;

    const curveLen = curve.getLength();
    if (curveLen < 0.001) return;

    progressRef.current = Math.min(progressRef.current + ROVER_SPEED / curveLen, 1);

    const pos = curve.getPoint(progressRef.current);
    const tan = curve.getTangent(progressRef.current);

    // ── Heading ───────────────────────────────────────────────────────────────
    const headingRad = Math.atan2(tan.x, tan.z);
    const headingDeg = ((headingRad * (180 / Math.PI)) + 360) % 360;

    // ── Speed ─────────────────────────────────────────────────────────────────
    let speed = 0;
    if (prevPosRef.current) {
      speed = pos.distanceTo(prevPosRef.current) * 60;
    }
    prevPosRef.current = pos.clone();

    // ── Terrain-snapped Y position ────────────────────────────────────────────
    // Use the CPU height-map to snap the rover to the actual surface elevation.
    // Fall back to the spline Y if terrain data is not yet loaded.
    let groundY: number;
    if (terrain?.heightMap) {
      groundY = getFullTerrainY(terrain.heightMap, pos.x, pos.z);
    } else {
      groundY = pos.y;
    }
    const snappedY = groundY + ROVER_GROUND_OFFSET;

    // ── Surface normal → rover tilt ───────────────────────────────────────────
    // Finite-difference the surface in X and Z to get the local normal,
    // then decompose into pitch (X rotation) and roll (Z rotation).
    let pitchRad = 0;
    let rollRad  = 0;
    if (terrain?.heightMap) {
      const hPX = getFullTerrainY(terrain.heightMap, pos.x + NORMAL_DELTA, pos.z);
      const hNX = getFullTerrainY(terrain.heightMap, pos.x - NORMAL_DELTA, pos.z);
      const hPZ = getFullTerrainY(terrain.heightMap, pos.x, pos.z + NORMAL_DELTA);
      const hNZ = getFullTerrainY(terrain.heightMap, pos.x, pos.z - NORMAL_DELTA);
      const slopeX = (hPX - hNX) / (2 * NORMAL_DELTA); // dY/dX
      const slopeZ = (hPZ - hNZ) / (2 * NORMAL_DELTA); // dY/dZ

      // Project slope into rover's local (heading-aligned) frame.
      const cosH = Math.cos(headingRad);
      const sinH = Math.sin(headingRad);

      // Pitch = forward slope; Roll = lateral slope
      pitchRad = -Math.atan(slopeZ * cosH + slopeX * sinH) * 0.6; // dampen a little
      rollRad  = Math.atan(slopeX * cosH - slopeZ * sinH) * 0.6;
    }

    setRoverState({
      position:    [pos.x, snappedY, pos.z],
      rotation:    [pitchRad, headingRad, rollRad],
      pathProgress: progressRef.current,
      speed,
      heading:     headingDeg,
      elevation:   snappedY,
    });

    if (progressRef.current >= 1) {
      setStatus('completed');
      progressRef.current = 0;
    }
  }, [curve, status, terrain, setRoverState, setStatus]);

  const reset = useCallback(() => {
    progressRef.current = 0;
    prevPosRef.current  = null;
  }, []);

  return { animate, reset };
}

/**
 * Converts API RoutePoints to Three.js world-space Vector3 array.
 *
 * @param points      - Path from the route API response.
 * @param gridSize    - Grid dimension (default GRID_SIZE constant)
 * @param terrainScale - Three.js terrain width/depth in world units.
 * @param heightScale  - Three.js terrain height multiplier.
 */
export function routePointsToVectors(
  points:       { x: number; z: number; y: number }[],
  gridSize:     number = GRID_SIZE,
  terrainScale: number = TERRAIN_SCALE,
  heightScale:  number = TERRAIN_HEIGHT_SCALE,
): THREE.Vector3[] {
  return points.map(p => {
    const wx = (p.x / gridSize - 0.5) * terrainScale;
    const wz = (p.z / gridSize - 0.5) * terrainScale;
    const wy = p.y * heightScale;
    return new THREE.Vector3(wx, wy, wz);
  });
}
