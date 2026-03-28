'use client';
import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import {
  ROVER_SPEED, TERRAIN_HEIGHT_SCALE, GRID_SIZE, TERRAIN_SCALE,
  ROUTE_Y_LIFT,
} from '@/lib/constants';
import { getWorldY, TERRAIN_GROUND_OFFSET } from '@/canvas/terrain/MoonTerrain';

/**
 * useRoverAnimation v4 — 4-Wheel Raycasting Kinematics
 *
 * Architecture upgrade from v3:
 *
 *  v3 used finite-difference slope (NORMAL_DELTA) to approximate pitch/roll.
 *  This treats the rover as a POINT, ignoring its physical width/length.
 *
 *  v4 solution — True rigid-body kinematics:
 *  1. Compute the 4 wheel contact positions in world space from the rover's
 *     current position + heading (FL, FR, RL, RR).
 *  2. Sample getWorldY() at each wheel position (O(1) bilinear heightmap lookup).
 *  3. Build two edge vectors of the chassis plane via the wheel heights.
 *  4. Cross-product those vectors → exact chassis normal (physics-correct UP vector).
 *  5. Derive Pitch and Roll from atan2 of the normal components.
 *  6. LERP all smoothed values (Y, pitch, roll) via persistent useRef accumulators
 *     to simulate heavy shock absorbers — no React setState, no frame stall.
 *  7. Export wheelHeights[FL, FR, RL, RR] so PlaceholderRover can independently
 *     offset each wheel group for per-axle suspension.
 */

// ─── Rover physical geometry constants (must match PlaceholderRover.tsx) ──────

/** Half-distance between left and right wheel contact points (world units). */
const WHEEL_HALF_WIDTH  = 0.72;

/** Half-distance between front and rear axles (world units). */
const WHEEL_HALF_LENGTH = 0.72;

// ─── LERP constants ────────────────────────────────────────────────────────────

/** Y-position LERP factor per frame — low = heavy suspension, high = stiff. */
const LERP_Y     = 0.12;

/** Pitch LERP factor per frame — slightly faster than Y for responsiveness. */
const LERP_PITCH = 0.18;

/** Roll LERP factor per frame. */
const LERP_ROLL  = 0.18;

// ─── Reusable THREE objects (avoid per-frame allocation) ──────────────────────
const _fwd    = new THREE.Vector3();
const _side   = new THREE.Vector3();
const _flPos  = new THREE.Vector3();
const _frPos  = new THREE.Vector3();
const _rlPos  = new THREE.Vector3();
const _rrPos  = new THREE.Vector3();
const _axVec  = new THREE.Vector3();
const _siVec  = new THREE.Vector3();
const _upVec  = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef  = useRef(0);
  const prevPosRef   = useRef<THREE.Vector3 | null>(null);

  // Smooth accumulators — stored in ref so LERP doesn't trigger React renders
  const smoothY     = useRef(0);
  const smoothPitch = useRef(0);
  const smoothRoll  = useRef(0);

  const { setRoverState, setStatus, status, routeResult } = useSimulationStore();
  const terrain = useTerrainStore(s => s.terrain);

  // Reset progress and smooth accumulators whenever route changes
  useEffect(() => {
    progressRef.current  = 0;
    prevPosRef.current   = null;
    smoothY.current      = 0;
    smoothPitch.current  = 0;
    smoothRoll.current   = 0;
  }, [routeResult]);

  const animate = useCallback(() => {
    if (!curve || status !== 'animating') return;

    const curveLen = curve.getLength();
    if (curveLen < 0.001) return;

    progressRef.current = Math.min(progressRef.current + ROVER_SPEED / curveLen, 1);

    const pos = curve.getPoint(progressRef.current);
    const tan = curve.getTangent(progressRef.current);

    // Heading (yaw) from curve tangent
    const headingRad = Math.atan2(tan.x, tan.z);
    const headingDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

    // Speed
    let speed = 0;
    if (prevPosRef.current) speed = pos.distanceTo(prevPosRef.current) * 60;
    prevPosRef.current = pos.clone();

    // ── 4-Wheel Raycasting ─────────────────────────────────────────────────────
    let centerY = pos.y;
    let pitchRaw = 0;
    let rollRaw  = 0;
    let yFL = 0, yFR = 0, yRL = 0, yRR = 0;

    if (terrain?.heightMap) {
      const hm = terrain.heightMap;

      // Rover local axes in world space (derived from heading):
      //   fwd  = direction rover is facing (+Z in rover-local → XZ world via heading)
      //   side = rover's right (+X in rover-local)
      _fwd.set(Math.sin(headingRad),  0, Math.cos(headingRad));
      _side.set(Math.cos(headingRad), 0, -Math.sin(headingRad));

      // 4 wheel contact positions:
      //   FL = pos - side*halfW - fwd*halfL   (front = -Z in rover local = toward heading)
      //   FR = pos + side*halfW - fwd*halfL
      //   RL = pos - side*halfW + fwd*halfL
      //   RR = pos + side*halfW + fwd*halfL
      _flPos.copy(pos)
        .addScaledVector(_side, -WHEEL_HALF_WIDTH)
        .addScaledVector(_fwd,  -WHEEL_HALF_LENGTH);
      _frPos.copy(pos)
        .addScaledVector(_side,  WHEEL_HALF_WIDTH)
        .addScaledVector(_fwd,  -WHEEL_HALF_LENGTH);
      _rlPos.copy(pos)
        .addScaledVector(_side, -WHEEL_HALF_WIDTH)
        .addScaledVector(_fwd,   WHEEL_HALF_LENGTH);
      _rrPos.copy(pos)
        .addScaledVector(_side,  WHEEL_HALF_WIDTH)
        .addScaledVector(_fwd,   WHEEL_HALF_LENGTH);

      // Sample terrain height at each wheel (O(1) bilinear lookup — same function
      // used to build the visual mesh, so zero drift between physics and visuals):
      yFL = getWorldY(hm, _flPos.x, _flPos.z);
      yFR = getWorldY(hm, _frPos.x, _frPos.z);
      yRL = getWorldY(hm, _rlPos.x, _rlPos.z);
      yRR = getWorldY(hm, _rrPos.x, _rrPos.z);

      // Chassis centre Y = average of all 4 contact points + clearance offset
      centerY = (yFL + yFR + yRL + yRR) * 0.25 + TERRAIN_GROUND_OFFSET;

      // ── Cross-product chassis normal ─────────────────────────────────────────
      //
      // Build two edge vectors that lie IN the chassis plane:
      //
      //   axleVec = mid-right − mid-left
      //     = ((FR_y + RR_y)/2) − ((FL_y + RL_y)/2)  in world Y direction
      //     combined with the side direction in XZ.
      //
      //   sideVec = mid-rear − mid-front
      //     = ((RL_y + RR_y)/2) − ((FL_y + FR_y)/2)  in world Y direction
      //     combined with the fwd direction in XZ.
      //
      // These are full 3D vectors, not just Y deltas:

      const midLeftY  = (yFL + yRL) * 0.5;
      const midRightY = (yFR + yRR) * 0.5;
      const midFrontY = (yFL + yFR) * 0.5;
      const midRearY  = (yRL + yRR) * 0.5;

      // axleVec  points from left axle midpoint to right axle midpoint
      // = side direction in XZ + Δheight in Y, over 2*halfW horizontal distance
      _axVec.set(
        _side.x * (2 * WHEEL_HALF_WIDTH),
        midRightY - midLeftY,
        _side.z * (2 * WHEEL_HALF_WIDTH),
      ).normalize();

      // sideVec points from front axle midpoint to rear axle midpoint
      // = fwd direction in XZ + Δheight in Y, over 2*halfL horizontal distance
      _siVec.set(
        _fwd.x * (2 * WHEEL_HALF_LENGTH),
        midRearY - midFrontY,
        _fwd.z * (2 * WHEEL_HALF_LENGTH),
      ).normalize();

      // Chassis UP = cross(axleVec, sideVec)
      // Right-hand rule: cross of right×forward = upward when surface is flat.
      _upVec.crossVectors(_axVec, _siVec).normalize();

      // Extract Euler angles from the chassis UP vector:
      //   Pitch (rotation.x): how much the front dips/rises
      //     → arctan of the Z-component vs Y-component of the UP vector
      //   Roll  (rotation.z): how much the right side dips/rises
      //     → arctan of the X-component vs Y-component of the UP vector
      pitchRaw = Math.atan2(-_upVec.z, _upVec.y);
      rollRaw  = Math.atan2( _upVec.x, _upVec.y);
    }

    // ── Suspension LERP ───────────────────────────────────────────────────────
    // Interpolate toward target values — simulates heavy shock absorbers.
    // LERP_Y = 0.12 means ~88% of the previous value carries over each frame,
    // giving a natural 'settling' effect under gravity.
    smoothY.current     += (centerY    - smoothY.current)     * LERP_Y;
    smoothPitch.current += (pitchRaw   - smoothPitch.current) * LERP_PITCH;
    smoothRoll.current  += (rollRaw    - smoothRoll.current)  * LERP_ROLL;

    setRoverState({
      position:     [pos.x, smoothY.current, pos.z],
      rotation:     [smoothPitch.current, headingRad, smoothRoll.current],
      pathProgress: progressRef.current,
      speed,
      heading:      headingDeg,
      elevation:    smoothY.current,
      wheelHeights: [yFL, yFR, yRL, yRR],
    });

    if (progressRef.current >= 1) {
      setStatus('completed');
      progressRef.current = 0;
    }
  }, [curve, status, terrain, setRoverState, setStatus]);

  const reset = useCallback(() => {
    progressRef.current  = 0;
    prevPosRef.current   = null;
    smoothY.current      = 0;
    smoothPitch.current  = 0;
    smoothRoll.current   = 0;
  }, []);

  return { animate, reset };
}

/**
 * Converts API RoutePoints to Three.js world-space Vector3 array.
 * Points are lifted by ROUTE_Y_LIFT above the terrain surface so that
 * the route tube never clips through the mesh.
 */
export function routePointsToVectors(
  points:       { x: number; z: number; y: number }[],
  gridSize:     number = GRID_SIZE,
  terrainScale: number = TERRAIN_SCALE,
  heightScale:  number = TERRAIN_HEIGHT_SCALE,
  heightMap?:   Float32Array | readonly number[],
): THREE.Vector3[] {
  return points.map(p => {
    const wx = (p.x / gridSize - 0.5) * terrainScale;
    const wz = (p.z / gridSize - 0.5) * terrainScale;
    // Use getWorldY when heightMap available — gives exact terrain Y including
    // sphere curvature.  Fall back to API-supplied p.y * heightScale otherwise.
    const wy = heightMap
      ? getWorldY(heightMap, wx, wz) + ROUTE_Y_LIFT
      : p.y * heightScale + ROUTE_Y_LIFT;
    return new THREE.Vector3(wx, wy, wz);
  });
}
