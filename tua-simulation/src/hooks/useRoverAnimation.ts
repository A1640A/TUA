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
 * useRoverAnimation v6 — Decoupled Heading + Surface-Normal Quaternion System
 *
 * ROOT CAUSE ANALYSIS (from v5 bug reports):
 *
 * PROBLEM A — Heading jitter from raw curve tangent:
 *   curve.getTangent(t) computes a finite-difference derivative which oscillates
 *   at path bends (especially CatmullRom knots). Feeding this directly into
 *   headingQ meant the rover's nose snapped ±30° inside a single frame even
 *   though smoothQ.slerp() was running. The slerp never had a chance to damp
 *   because the TARGET quaternion itself was the jittery one.
 *
 *   FIX: Maintain a separate smoothHeadingQ that SLERPs toward the raw heading
 *   every frame. This decouples heading filtering from tilt filtering.
 *
 * PROBLEM B — Surface normal computed from getWorldY() which includes sphereDip:
 *   getWorldY = heightSample + sphereDip(wx, wz).
 *   sphereDip is a parabolic function of world position, NOT linear between
 *   adjacent wheel sample points. When the 4 wheels are 1.44 m apart the
 *   sphereDip DIFFERENCE between front and rear is ~0.001 units — negligible.
 *   However, getWorldY calls add the DIP per wheel independently, so the
 *   cross-product chassis normal is correct as long as we are consistent.
 *   No bug here — documented for clarity.
 *
 * PROBLEM C — setFromUnitVectors instability when vectors are nearly parallel:
 *   Three.js r150+ guards this internally, but we add an explicit dot-product
 *   early-exit for safety. More important: the tilt quaternion was built from
 *   _upLocal expressed in HEADING frame, which requires applying _invHeadQ.
 *   If _headingQ changes between frames while _invHeadQ is computed from the
 *   previous frame (stale), the local-frame transform is wrong by one frame.
 *   FIX: Compute _invHeadQ from _chassisHeadQ (the smoothed heading), not
 *   from the raw instantaneous heading. This keeps tilt in the same frame
 *   as the heading we actually rendered last frame.
 *
 * PROBLEM D — Y-offset: TERRAIN_GROUND_OFFSET = 0.28 is the chassis bottom
 *   clearance, but rover model origin is at the wheel axle plane (y=0).
 *   The chassis CG is at y ≈ 0.46 above the wheel axle, so the correct Y for
 *   the group origin (which IS the axle plane) is:
 *     centerY = avgWheelY + TERRAIN_GROUND_OFFSET
 *   This matches the existing code — verified correct.
 *
 * v6 ALGORITHM (per frame):
 *   1. Raw heading from finite-difference of world positions (more stable than
 *      curve tangent at knots) — fallback to tangent when pos delta < 0.001.
 *   2. SLERP smoothHeadingQ smoothly toward raw heading quaternion (SLERP_HEAD).
 *   3. 4-wheel raycasting using smoothHeadingQ to determine wheel positions
 *      (eliminates feedback loop: wheel positions no longer depend on jittery
 *      raw heading).
 *   4. Cross-product normal in WORLD space from wheel contact points.
 *   5. Express world normal in SMOOTHED heading frame (not raw heading frame).
 *   6. Build tiltQ = setFromUnitVectors(worldY, upLocal_in_headingFrame).
 *   7. chassisQ = smoothHeadingQ × tiltQ.
 *   8. SLERP smoothQ toward chassisQ (SLERP_TILT) — independent rate for
 *      suspension feel without affecting heading responsiveness.
 *   9. Extract XYZ euler from smoothQ → group rotation prop.
 */

// ─── Physical geometry (must match PlaceholderRover.tsx wheel positions) ───────

/** Half-distance between left and right wheel contact points. */
const WHEEL_HALF_WIDTH  = 0.72;

/** Half-distance between front and rear axles. */
const WHEEL_HALF_LENGTH = 0.72;

/**
 * Extra bias added to the normal cross-product lengths to stabilise the
 * normal when the terrain is very flat (avoids near-zero cross product).
 * Does not affect orientation accuracy on slopes.
 */
const WHEEL_BASE_BIAS = 0.01;

// ─── Timing constants ──────────────────────────────────────────────────────────

/** Suspension Y LERP factor per frame (~0.3 s settle at 60 fps). */
const LERP_Y     = 0.12;

/**
 * Heading SLERP factor per frame.
 * Higher than tilt: we want the rover nose to track the path direction quickly
 * (max ~0.2 s lag at 60 fps), while suspension settles more slowly.
 * SLERP_HEAD = 0.22 → ~50% settling in 3 frames, full in ~15 frames.
 */
const SLERP_HEAD = 0.22;

/**
 * Tilt / suspension SLERP factor per frame.
 * Lower than heading: chassis tilt is a physical mass-spring system and should
 * lag the terrain normal by ~0.4 s for a realistic feel.
 * SLERP_TILT = 0.10 → ~50% settling in 7 frames, full in ~30 frames.
 */
const SLERP_TILT = 0.10;

// ─── Module-level scratch objects (zero GC per frame) ─────────────────────────
const _WORLD_UP   = new THREE.Vector3(0, 1, 0);  // immutable canonical up

// Heading computation
const _rawHeadQ   = new THREE.Quaternion();       // target (raw) heading each frame
const _smoothHQ   = new THREE.Quaternion();       // smoothed heading quaternion (module-level scratch)
const _invSmoothH = new THREE.Quaternion();       // inverse of smoothed heading

// Wheel contact positions (world space)
const _fwd        = new THREE.Vector3();
const _side       = new THREE.Vector3();
const _flPos      = new THREE.Vector3();
const _frPos      = new THREE.Vector3();
const _rlPos      = new THREE.Vector3();
const _rrPos      = new THREE.Vector3();

// Normal computation
const _axVec      = new THREE.Vector3();          // right-axis vector (side direction)
const _siVec      = new THREE.Vector3();          // forward-axis vector (fwd direction)
const _worldNorm  = new THREE.Vector3();          // chassis normal in WORLD space
const _localNorm  = new THREE.Vector3();          // chassis normal in HEADING-LOCAL space

// Rotation assembly
const _tiltQ      = new THREE.Quaternion();       // tilt quaternion (heading-local)
const _chassisQ   = new THREE.Quaternion();       // final chassis quaternion
const _euler      = new THREE.Euler();            // scratch euler for output

// Motion delta
const _posDelta   = new THREE.Vector3();          // per-frame position delta for heading

// ─────────────────────────────────────────────────────────────────────────────

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef = useRef(0);

  /**
   * World-space position from the previous frame.
   * Used for a finite-difference heading estimate which is smoother than the
   * analytic CatmullRom tangent at knots.
   */
  const prevPosRef = useRef<THREE.Vector3 | null>(null);

  /** Smoothed chassis centre Y (suspension spring). */
  const smoothY = useRef(0);

  /**
   * Smoothed heading quaternion — controlled by SLERP_HEAD.
   * Only the Y-axis rotation (azimuth); no pitch/roll.
   */
  const smoothHeadingQ = useRef(new THREE.Quaternion());

  /**
   * Smoothed full chassis quaternion — controlled by SLERP_TILT.
   * Encodes heading + pitch + roll. Extracted to Euler for the group prop.
   */
  const smoothQ = useRef(new THREE.Quaternion());

  const { setRoverState, setStatus, status, routeResult } = useSimulationStore();
  const terrain = useTerrainStore(s => s.terrain);

  // Reset all accumulators on new route
  useEffect(() => {
    progressRef.current    = 0;
    prevPosRef.current     = null;
    smoothY.current        = 0;
    smoothHeadingQ.current.identity();
    smoothQ.current.identity();
  }, [routeResult]);

  const animate = useCallback(() => {
    if (!curve || status !== 'animating') return;

    const curveLen = curve.getLength();
    if (curveLen < 0.001) return;

    progressRef.current = Math.min(progressRef.current + ROVER_SPEED / curveLen, 1);

    const pos = curve.getPoint(progressRef.current);
    const tan = curve.getTangent(progressRef.current);

    // ── Heading computation ───────────────────────────────────────────────────
    //
    // Prefer finite-difference from world position (smoother at knots) over the
    // analytic tangent which has discontinuities where CatmullRom joins segments.
    // Fallback to tangent when the rover hasn't moved far enough yet (first frame
    // after reset, or extremely short progress increments).
    let headingRad: number;
    if (prevPosRef.current) {
      _posDelta.subVectors(pos, prevPosRef.current);
      const dLen = _posDelta.length();
      if (dLen > 0.0005) {
        // Use actual displacement direction — free of CatmullRom tangent noise
        headingRad = Math.atan2(_posDelta.x, _posDelta.z);
      } else {
        // Too small a step — fall back to analytic tangent
        headingRad = Math.atan2(tan.x, tan.z);
      }
    } else {
      headingRad = Math.atan2(tan.x, tan.z);
    }

    const headingDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

    // Speed (world units/second, estimated at 60 fps)
    let speed = 0;
    if (prevPosRef.current) speed = pos.distanceTo(prevPosRef.current) * 60;
    prevPosRef.current = pos.clone();

    // ── Step 1: Build raw heading quaternion and SLERP into smoothHeadingQ ────
    //
    // setFromAxisAngle(worldY, headingRad) gives us a pure Y-axis rotation.
    // SLERP_HEAD is intentionally higher than SLERP_TILT so the rover nose
    // tracks the path more tightly than the chassis rocks on terrain.
    _rawHeadQ.setFromAxisAngle(_WORLD_UP, headingRad);

    // Ensure SLERP takes the shortest arc (handles 359° → 0° crossing)
    if (smoothHeadingQ.current.dot(_rawHeadQ) < 0) {
      _rawHeadQ.set(-_rawHeadQ.x, -_rawHeadQ.y, -_rawHeadQ.z, -_rawHeadQ.w);
    }
    smoothHeadingQ.current.slerp(_rawHeadQ, SLERP_HEAD);

    // ── Step 2: 4-Wheel Raycasting with SMOOTHED heading axes ────────────────
    //
    // Using smoothHeadingQ-derived axes (not raw headingRad) so that wheel
    // positions don't jump abruptly when headingRad has a knot discontinuity.
    // The smoothed heading is what we actually rendered last frame.
    let centerY = pos.y;
    let yFL = 0, yFR = 0, yRL = 0, yRR = 0;

    // Default: heading-only orientation (used when no terrain data)
    _chassisQ.copy(smoothHeadingQ.current);

    if (terrain?.heightMap) {
      const hm = terrain.heightMap;

      // Rover local axes derived from SMOOTHED heading quaternion
      // _fwd  = smoothHeadingQ × (0,0,1) = rover forward in world space
      // _side = smoothHeadingQ × (1,0,0) = rover right in world space
      _fwd.set(0, 0, 1).applyQuaternion(smoothHeadingQ.current);
      _side.set(1, 0, 0).applyQuaternion(smoothHeadingQ.current);

      // Flatten to XZ — we only want horizontal wheel placement;
      // terrain height is read from the heightmap, not from the path curve.
      _fwd.y  = 0; _fwd.normalize();
      _side.y = 0; _side.normalize();

      // 4 wheel contact positions in world XZ plane:
      //   +_fwd  = forward (nose of rover, -Z in model space because rover
      //            faces -Z by default in Three.js but +Z in world at heading=0)
      //   -_fwd  = backward
      //   +_side = rover right (world +X at heading=0)
      //   -_side = rover left
      _flPos.copy(pos).addScaledVector(_side, -WHEEL_HALF_WIDTH).addScaledVector(_fwd,  WHEEL_HALF_LENGTH); // front-left
      _frPos.copy(pos).addScaledVector(_side,  WHEEL_HALF_WIDTH).addScaledVector(_fwd,  WHEEL_HALF_LENGTH); // front-right
      _rlPos.copy(pos).addScaledVector(_side, -WHEEL_HALF_WIDTH).addScaledVector(_fwd, -WHEEL_HALF_LENGTH); // rear-left
      _rrPos.copy(pos).addScaledVector(_side,  WHEEL_HALF_WIDTH).addScaledVector(_fwd, -WHEEL_HALF_LENGTH); // rear-right

      // Sample terrain elevation at each wheel contact point
      yFL = getWorldY(hm, _flPos.x, _flPos.z);
      yFR = getWorldY(hm, _frPos.x, _frPos.z);
      yRL = getWorldY(hm, _rlPos.x, _rlPos.z);
      yRR = getWorldY(hm, _rrPos.x, _rrPos.z);

      // Chassis centre target Y = average of 4 contact heights + clearance offset
      centerY = (yFL + yFR + yRL + yRR) * 0.25 + TERRAIN_GROUND_OFFSET;

      // ── Step 3: Build chassis surface normal via cross product ────────────
      //
      // We have 4 contact points that define the terrain plane under the rover.
      // Compute midpoints along each axle and wheelbase:
      //
      //   midFront = (FL + FR) / 2  — centre of front axle
      //   midRear  = (RL + RR) / 2  — centre of rear axle
      //   midLeft  = (FL + RL) / 2  — centre of left side
      //   midRight = (FR + RR) / 2  — centre of right side
      //
      // Two span vectors:
      //   _siVec = midFront - midRear  (front-to-rear axis)
      //   _axVec = midRight - midLeft  (left-to-right axis)
      //
      // Normal = _siVec × _axVec  (right-hand rule → points UP when front is
      // higher than rear and right is higher than left, as expected for a rover
      // climbing forward-right).
      //
      // We add WHEEL_BASE_BIAS to the XZ components so the cross product is
      // never near-zero on perfectly flat (yFL=yFR=yRL=yRR) terrain.

      const midFrontY = (yFL + yFR) * 0.5;
      const midRearY  = (yRL + yRR) * 0.5;
      const midLeftY  = (yFL + yRL) * 0.5;
      const midRightY = (yFR + yRR) * 0.5;

      // _siVec: forward span vector (rear→front, in rover's +fwd direction)
      //   XZ = 2 × WHEEL_HALF_LENGTH × _fwd  (we double because midFront-midRear)
      //   Y  = midFrontY - midRearY           (terrain elevation difference)
      _siVec.set(
        _fwd.x * (2 * WHEEL_HALF_LENGTH + WHEEL_BASE_BIAS),
        midFrontY - midRearY,
        _fwd.z * (2 * WHEEL_HALF_LENGTH + WHEEL_BASE_BIAS),
      );  // length is NOT normalised yet — magnitude matters for cross product

      // _axVec: rightward span vector (left→right, in rover's +side direction)
      //   XZ = 2 × WHEEL_HALF_WIDTH × _side
      //   Y  = midRightY - midLeftY
      _axVec.set(
        _side.x * (2 * WHEEL_HALF_WIDTH + WHEEL_BASE_BIAS),
        midRightY - midLeftY,
        _side.z * (2 * WHEEL_HALF_WIDTH + WHEEL_BASE_BIAS),
      );

      // Cross product: _siVec × _axVec
      // Verification (flat terrain, heading=0):
      //   _siVec ≈ (0, 0, +2·0.72)  →  forward in +Z
      //   _axVec ≈ (+2·0.72, 0, 0)  →  right in +X
      //   _siVec × _axVec = (0·0 - 2·0.72·0, 2·0.72·2·0.72 - 0·0, 0·0 - 0·2·0.72)
      //                   ≈ (0, +4·0.72², 0)  →  UP ✓
      _worldNorm.crossVectors(_siVec, _axVec).normalize();

      // Safety guard: if cross product degenerates (parallel vectors or near-NaN)
      // or Y component goes negative (impossible on real terrain), reset to worldUp.
      if (!isFinite(_worldNorm.x) || !isFinite(_worldNorm.y) || _worldNorm.y < 0.08) {
        _worldNorm.copy(_WORLD_UP);
      }

      // ── Step 4: Express world normal in SMOOTHED heading frame ────────────
      //
      // The tilt quaternion must be built in the rover's LOCAL frame (as seen
      // from the cockpit), NOT in world frame. Otherwise the same physical slope
      // appears as wildly different pitch/roll values depending on heading —
      // the root cause of the original tumbling bug.
      //
      // We use smoothHeadingQ (the slow-filtered heading) as the reference frame
      // rather than the raw headingRad. This prevents a stale inverse from
      // causing a one-frame wrong tilt direction when the raw heading jumps.
      _invSmoothH.copy(smoothHeadingQ.current).invert();
      _localNorm.copy(_worldNorm).applyQuaternion(_invSmoothH);

      // ── Step 5: Build tilt quaternion in heading-local frame ──────────────
      //
      // _tiltQ rotates the rover's local Y (0,1,0) to point along _localNorm.
      // This tilt is then composed with the heading quaternion in Step 6.
      const dot = THREE.MathUtils.clamp(_localNorm.dot(_WORLD_UP), -1.0, 1.0);

      if (dot > 0.9999) {
        // Terrain is flat in rover frame — identity tilt
        _tiltQ.identity();
      } else if (dot < -0.9999) {
        // Rover is on an inverted surface (theoretical guard)
        // Use a fallback rotation around the rover's right axis
        _tiltQ.setFromAxisAngle(_side, Math.PI);
      } else {
        _tiltQ.setFromUnitVectors(_WORLD_UP, _localNorm.normalize());
      }

      // ── Step 6: Compose heading × tilt → final chassis quaternion ─────────
      //
      // Convention: smoothHeadingQ applied first (azimuth), _tiltQ applied
      // second IN THE HEADING-LOCAL FRAME gives us:
      //   chassisQ = smoothHeadingQ × tiltQ
      //
      // This is the standard "parent × child" quaternion composition.
      // Result: rover faces smoothed heading direction AND conforms to terrain.
      _chassisQ.copy(smoothHeadingQ.current).multiply(_tiltQ);
    }

    // ── Step 7: SLERP full chassis orientation ────────────────────────────────
    //
    // We SLERP with SLERP_TILT (slower than heading) for suspension feel.
    // The heading component is already pre-smoothed inside smoothHeadingQ so
    // we don't double-smooth it — but SLERP_TILT adds a secondary layer of
    // damping that simulates chassis mass inertia. Net effect:
    //   heading: ~SLERP_HEAD primary + SLERP_TILT secondary
    //   tilt:    ~SLERP_TILT only (heading is already baked into chassisQ)
    smoothY.current += (centerY - smoothY.current) * LERP_Y;

    // Ensure SLERP takes the shortest arc for the full chassis quaternion too
    if (smoothQ.current.dot(_chassisQ) < 0) {
      _chassisQ.set(-_chassisQ.x, -_chassisQ.y, -_chassisQ.z, -_chassisQ.w);
    }
    smoothQ.current.slerp(_chassisQ, SLERP_TILT);

    // ── Step 8: Extract Euler for <group rotation={[rx,ry,rz]}> ──────────────
    //
    // Three.js applies group rotation in intrinsic XYZ order (default).
    // Extracting in the same order from the quaternion guarantees an exact
    // round-trip: the group displays precisely the orientation we computed.
    // YXZ would be the "vehicle" convention but XYZ is what Three.js uses
    // for the rotation prop — using the WRONG order here causes the flip.
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
    progressRef.current    = 0;
    prevPosRef.current     = null;
    smoothY.current        = 0;
    smoothHeadingQ.current.identity();
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
