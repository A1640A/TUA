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
 * useRoverAnimation v5 — Quaternion-Based Chassis Orientation
 *
 * Root-cause fix for rover "tumbling" observed in v4:
 *
 * BUG 1 — World-space pitch/roll applied in heading-local frame:
 *   v4 extracted pitch/roll from the chassis UP vector using world-space atan2:
 *     pitchRaw = Math.atan2(-upVec.z, upVec.y)   ← world-Z component
 *     rollRaw  = Math.atan2( upVec.x, upVec.y)   ← world-X component
 *   These angles are fixed in the WORLD frame but are stored as
 *   rotation=[pitch, headingRad, roll] and applied with default XYZ Euler order.
 *   When the rover turns, the same slope appears as different pitch/roll
 *   combinations → model violently flips at path bends.
 *
 * BUG 2 — Heading discontinuity:
 *   Math.atan2(tan.x, tan.z) can jump ±π when the path crosses certain angles.
 *   headingRad went directly to the store with no smoothing → 360° spin in 1 frame.
 *
 * BUG 3 — Euler order mismatch:
 *   Three.js default XYZ Euler means: first pitch (world X), then yaw (world Y
 *   after X-rotation!), then roll. Correct vehicle order is YXZ.
 *
 * v5 SOLUTION — single quaternion per frame:
 *   1. qHeading = setFromAxisAngle(worldY, headingRad)
 *   2. upLocal  = upVec.applyQuaternion(qHeading⁻¹)   ← normal in heading frame
 *   3. qTilt    = setFromUnitVectors(worldY, upLocal)  ← heading-relative tilt
 *   4. qChassis = qHeading × qTilt
 *   5. SLERP smoothQ toward qChassis every frame:
 *      • eliminates ±π heading jump (quaternion SLERP always takes shortest arc)
 *      • provides natural suspension damping in one operation
 *   6. Extract XYZ Euler from smoothQ → <group rotation={[rx,ry,rz]}> (correct by construction)
 */

// ─── Rover physical geometry constants (must match PlaceholderRover.tsx) ──────

/** Half-distance between left and right wheel contact points (world units). */
const WHEEL_HALF_WIDTH  = 0.72;

/** Half-distance between front and rear axles (world units). */
const WHEEL_HALF_LENGTH = 0.72;

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Y-position LERP factor per frame (suspension spring). */
const LERP_Y  = 0.12;

/**
 * Quaternion SLERP factor — 0.14 gives ~0.3 s settle time at 60 fps.
 * Higher than the old 0.08 to remain responsive during path bends.
 */
const SLERP_Q = 0.14;

// ─── Module-level scratch objects (zero per-frame allocation) ─────────────────
const _worldUp  = new THREE.Vector3(0, 1, 0);
const _fwd      = new THREE.Vector3();
const _side     = new THREE.Vector3();
const _flPos    = new THREE.Vector3();
const _frPos    = new THREE.Vector3();
const _rlPos    = new THREE.Vector3();
const _rrPos    = new THREE.Vector3();
const _axVec    = new THREE.Vector3();
const _siVec    = new THREE.Vector3();
const _upVec    = new THREE.Vector3();
const _upLocal  = new THREE.Vector3();
const _headingQ = new THREE.Quaternion();
const _invHeadQ = new THREE.Quaternion();
const _tiltQ    = new THREE.Quaternion();
const _chassisQ = new THREE.Quaternion();
const _euler    = new THREE.Euler();

// ─────────────────────────────────────────────────────────────────────────────

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef = useRef(0);
  const prevPosRef  = useRef<THREE.Vector3 | null>(null);

  /** Smoothed chassis centre height (Y LERP). */
  const smoothY = useRef(0);

  /**
   * Smoothed chassis orientation quaternion (replaces separate smoothPitch /
   * smoothRoll refs).  One SLERP handles heading + pitch + roll coherently,
   * without the ±π discontinuity of raw Math.atan2 angle LERP.
   */
  const smoothQ = useRef(new THREE.Quaternion());

  const { setRoverState, setStatus, status, routeResult } = useSimulationStore();
  const terrain = useTerrainStore(s => s.terrain);

  // Reset all accumulators whenever a new route is loaded
  useEffect(() => {
    progressRef.current = 0;
    prevPosRef.current  = null;
    smoothY.current     = 0;
    smoothQ.current.identity();
  }, [routeResult]);

  const animate = useCallback(() => {
    if (!curve || status !== 'animating') return;

    const curveLen = curve.getLength();
    if (curveLen < 0.001) return;

    progressRef.current = Math.min(progressRef.current + ROVER_SPEED / curveLen, 1);

    const pos = curve.getPoint(progressRef.current);
    const tan = curve.getTangent(progressRef.current);

    // Heading from curve tangent — will be smoothed via quaternion SLERP
    const headingRad = Math.atan2(tan.x, tan.z);
    const headingDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

    // Speed: distance per second
    let speed = 0;
    if (prevPosRef.current) speed = pos.distanceTo(prevPosRef.current) * 60;
    prevPosRef.current = pos.clone();

    // ── 4-Wheel Raycasting ────────────────────────────────────────────────────
    let centerY = pos.y;
    let yFL = 0, yFR = 0, yRL = 0, yRR = 0;

    // Default: pure heading rotation (no terrain tilt)
    _headingQ.setFromAxisAngle(_worldUp, headingRad);
    _chassisQ.copy(_headingQ);

    if (terrain?.heightMap) {
      const hm = terrain.heightMap;

      // Rover local axes in world space
      _fwd.set( Math.sin(headingRad), 0,  Math.cos(headingRad));
      _side.set(Math.cos(headingRad), 0, -Math.sin(headingRad));

      // 4 wheel contact positions
      _flPos.copy(pos).addScaledVector(_side, -WHEEL_HALF_WIDTH).addScaledVector(_fwd, -WHEEL_HALF_LENGTH);
      _frPos.copy(pos).addScaledVector(_side,  WHEEL_HALF_WIDTH).addScaledVector(_fwd, -WHEEL_HALF_LENGTH);
      _rlPos.copy(pos).addScaledVector(_side, -WHEEL_HALF_WIDTH).addScaledVector(_fwd,  WHEEL_HALF_LENGTH);
      _rrPos.copy(pos).addScaledVector(_side,  WHEEL_HALF_WIDTH).addScaledVector(_fwd,  WHEEL_HALF_LENGTH);

      // Sample terrain height at each wheel
      yFL = getWorldY(hm, _flPos.x, _flPos.z);
      yFR = getWorldY(hm, _frPos.x, _frPos.z);
      yRL = getWorldY(hm, _rlPos.x, _rlPos.z);
      yRR = getWorldY(hm, _rrPos.x, _rrPos.z);

      // Chassis centre Y = average contact height + clearance
      centerY = (yFL + yFR + yRL + yRR) * 0.25 + TERRAIN_GROUND_OFFSET;

      // ── Cross-product chassis normal (same as v4, proven correct) ───────────
      const midLeftY  = (yFL + yRL) * 0.5;
      const midRightY = (yFR + yRR) * 0.5;
      const midFrontY = (yFL + yFR) * 0.5;
      const midRearY  = (yRL + yRR) * 0.5;

      _axVec.set(
        _side.x * (2 * WHEEL_HALF_WIDTH),
        midRightY - midLeftY,
        _side.z * (2 * WHEEL_HALF_WIDTH),
      ).normalize();

      _siVec.set(
        _fwd.x * (2 * WHEEL_HALF_LENGTH),
        midRearY - midFrontY,
        _fwd.z * (2 * WHEEL_HALF_LENGTH),
      ).normalize();

      // ── Cross-product chassis normal ──────────────────────────────────────
      // CRITICAL ORDER: _siVec × _axVec = UP for right-handed coordinates.
      // Proof (flat terrain, heading=0):
      //   _axVec = (1,0,0)  _siVec = (0,0,1)
      //   _axVec × _siVec = (0,-1,0)  ← DOWN  ✗  (old bug → rover flipped)
      //   _siVec × _axVec = (0,+1,0)  ← UP    ✓
      _upVec.crossVectors(_siVec, _axVec).normalize();

      // Safety: if the cross product degenerates (parallel vectors or NaN),
      // the Y component goes negative — clamp to world-up to avoid flip.
      if (!isFinite(_upVec.x) || !isFinite(_upVec.y) || _upVec.y < 0.05) {
        _upVec.set(0, 1, 0);
      }

      // ── Quaternion chassis orientation (v5 — replaces atan2 pitch/roll) ──────
      //
      // The chassis normal (_upVec) is in WORLD space. To build a correct
      // orientation quaternion we must express the tilt in the HEADING-LOCAL
      // frame; otherwise the same slope appears as different pitch/roll
      // depending on which direction the rover faces (the tumbling bug).
      //
      // Step 1: Compute the inverse of the heading quaternion.
      //         (Quaternion conjugate == inverse for unit quaternions)
      _invHeadQ.copy(_headingQ).invert();

      // Step 2: Express the world-space chassis normal in the heading frame.
      //         This gives us the "upward tilt seen from the rover's cockpit".
      _upLocal.copy(_upVec).applyQuaternion(_invHeadQ);

      // Step 3: Build the tilt quaternion that rotates heading-local Y (0,1,0)
      //         to the heading-local terrain normal.
      //         Guard the near-identity case: setFromUnitVectors is numerically
      //         unstable when src ≈ dst (dot product ≈ 1.0).
      const dot = THREE.MathUtils.clamp(_upLocal.dot(_worldUp), -1, 1);
      if (dot > 0.9998) {
        // Surface is essentially flat in rover frame — no tilt needed
        _tiltQ.identity();
      } else if (dot < -0.9998) {
        // Surface is inverted (impossible in practice but guard anyway)
        _tiltQ.setFromAxisAngle(_fwd, Math.PI);
      } else {
        _tiltQ.setFromUnitVectors(_worldUp, _upLocal.normalize());
      }

      // Step 4: Final chassis quaternion = heading × tilt (heading applied first,
      //         then tilt around the rover's own axes — correct vehicle convention).
      _chassisQ.copy(_headingQ).multiply(_tiltQ);
    }

    // ── SLERP — smooth heading + suspension in one operation ─────────────────
    //
    // Unlike the old separate pitch/roll LERP, quaternion SLERP:
    //   • Always takes the SHORTEST arc (no ±π heading jump across ~180° turns)
    //   • Correctly interpolates the combined rotation (no cross-axis artefacts)
    //   • Provides the same heavy-suspension feel at SLERP_Q = 0.08
    smoothY.current += (centerY - smoothY.current) * LERP_Y;
    smoothQ.current.slerp(_chassisQ, SLERP_Q);

    // ── Extract Euler for <group rotation={[rx,ry,rz]}> ──────────────────────
    //
    // Three.js applies rotation props with the group's default XYZ Euler order.
    // Extracting in the SAME order from the quaternion guarantees the group
    // displays the exact orientation we computed — no extra transform.
    _euler.setFromQuaternion(smoothQ.current, 'XYZ');

    setRoverState({
      position:     [pos.x, smoothY.current, pos.z],
      rotation:     [_euler.x, _euler.y, _euler.z],
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
    progressRef.current = 0;
    prevPosRef.current  = null;
    smoothY.current     = 0;
    smoothQ.current.identity();
  }, []);

  return { animate, reset };
}

/**
 * Converts API RoutePoints to Three.js world-space Vector3 array.
 *
 * When heightMap is provided (normal path), getWorldY() is used — includes
 * procedural height AND sphere-curvature dip, identical to the visual geometry.
 * The heightMap fallback (p.y * heightScale) is only hit if terrain hasn't
 * loaded yet and should never be visible in production.
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
    const wy = heightMap
      ? getWorldY(heightMap, wx, wz) + ROUTE_Y_LIFT
      : p.y * heightScale + ROUTE_Y_LIFT;
    return new THREE.Vector3(wx, wy, wz);
  });
}
