'use client';
import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { ROVER_SPEED, TERRAIN_HEIGHT_SCALE, GRID_SIZE, TERRAIN_SCALE } from '@/lib/constants';

/**
 * Drives the rover along the CatmullRom spline each animation frame.
 *
 * Fixes:
 * - `progressRef` is reset to 0 whenever `routeResult` changes so re-runs
 *   and reroutes always start from the beginning of the new path.
 * - Derives `speed`, `heading`, and `elevation` from the curve tangent and
 *   current position and writes them back to the store for the HUD telemetry.
 *
 * @param curve - CatmullRom spline built from the route API response.
 * @returns `{ animate }` — call inside `useFrame` every tick.
 */
export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef  = useRef(0);
  const prevPosRef   = useRef<THREE.Vector3 | null>(null);
  const { setRoverState, setStatus, status, routeResult } = useSimulationStore();

  // ── Reset progress whenever the route changes (fixes mid-path re-run bug) ──
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

    // Heading: azimuth clockwise from North (+Z axis), in degrees.
    const headingRad = Math.atan2(tan.x, tan.z);
    const headingDeg = ((headingRad * (180 / Math.PI)) + 360) % 360;

    // Instantaneous speed in Three.js units per second (approx 60 fps).
    let speed = 0;
    if (prevPosRef.current) {
      speed = pos.distanceTo(prevPosRef.current) * 60;
    }
    prevPosRef.current = pos.clone();

    setRoverState({
      position:    [pos.x, pos.y + 0.3, pos.z],
      rotation:    [0, headingRad, 0],
      pathProgress: progressRef.current,
      speed,
      heading:     headingDeg,
      elevation:   pos.y,
    });

    if (progressRef.current >= 1) {
      setStatus('completed');
      progressRef.current = 0;
    }
  }, [curve, status, setRoverState, setStatus]);

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
 * @param gridSize    - Grid dimension (default GRID_SIZE constant).
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
