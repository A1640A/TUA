'use client';
import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import {
  ROVER_SPEED, TERRAIN_HEIGHT_SCALE, GRID_SIZE, TERRAIN_SCALE,
  ROUTE_Y_LIFT,
} from '@/lib/constants';
import { getHeightAt, getNormalAt } from '@/lib/terrainSampler';
import { TERRAIN_GROUND_OFFSET } from '@/canvas/terrain/MoonTerrain';

/**
 * useRoverAnimation v7 — CPU Height & Normal Sampler (Raycaster-Free)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ROOT CAUSE OF PREVIOUS BUGS (displacementMap era)
 * ════════════════════════════════════════════════════════════════════════
 *  The original GPU displacementMap displaced vertices only in the shader.
 *  A Raycaster running on the CPU still saw the ORIGINAL flat geometry, so
 *  the rover would hover, fall through craters, or tumble on slopes.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  v7 SOLUTION
 * ════════════════════════════════════════════════════════════════════════
 *  • No Raycaster anywhere in the codebase.
 *  • getHeightAt(hm, x, z)  — bilinear sample of CPU heightMap + sphere
 *    curvature dip.  Returns the EXACT Y that MoonTerrain.tsx bakes into
 *    vertex positions → rover always sits on the visual surface.
 *  • getNormalAt(hm, x, z)  — 3-point finite-difference surface normal.
 *    Builds a micro-triangle from (x,z), (x+δ,z), (x,z+δ), cross-products
 *    the two edges → mathematically exact surface normal, zero GPU cost.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  PER-FRAME ALGORITHM (useFrame callback)
 * ════════════════════════════════════════════════════════════════════════
 *  1.  Advance progress along CatmullRom spline.
 *  2.  Compute raw heading from finite-difference of world positions
 *      (smoother than CatmullRom tangent at knots).
 *  3.  SLERP smoothHeadingQ toward raw heading quaternion (SLERP_HEAD).
 *  4.  Place 4 virtual wheel contact points using smoothed axes.
 *  5.  Sample getHeightAt() at each wheel → exact terrain contact Y.
 *  6.  Chassis centre Y = avg(4 wheels) + TERRAIN_GROUND_OFFSET.
 *  7.  Sample getNormalAt() at chassis centre → surface normal.
 *  8.  Express surface normal in heading-local frame (rotate by inverse
 *      of smoothHeadingQ).
 *  9.  Build _tiltQ = setFromUnitVectors(worldUp, localNormal).
 *  10. chassisQ = smoothHeadingQ × _tiltQ.
 *  11. SLERP smoothQ toward chassisQ (SLERP_TILT) — suspension damping.
 *  12. Extract XYZ Euler → write to simulationStore roverState.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  WHY FINITE-DIFFERENCE NORMAL (not 4-wheel cross product)?
 * ════════════════════════════════════════════════════════════════════════
 *  Both are valid; 3-point FD wins here because:
 *   a) Fewer sample calls (3 vs 4 + midpoint arithmetic).
 *   b) Delta is small (0.25 m) so it captures local crater curvature
 *      without averaging it away across the 1.44 m wheel base.
 *   c) Consistent with the user-spec (getNormalAt requirement).
 *  The 4-wheel cross-product is used in wheelHeights (for suspension).
 */

// ─── Physical geometry (must match PlaceholderRover.tsx wheel positions) ───────

/** Half-distance between left and right wheel contact points. */
const WHEEL_HALF_WIDTH  = 0.72;

/** Half-distance between front and rear axles. */
const WHEEL_HALF_LENGTH = 0.72;

/**
 * Extra horizontal bias added to the cross-product vectors so the normal
 * is well-defined even on perfectly flat terrain (avoids zero cross-product).
 */
const WHEEL_BASE_BIAS = 0.01;

// ─── Timing constants ──────────────────────────────────────────────────────────

/** Chassis centre Y LERP factor per frame (~0.3 s settle at 60 fps). */
const LERP_Y = 0.12;

/**
 * Heading SLERP factor per frame.
 * Higher than tilt: rover nose tracks path quickly (≈0.2 s lag at 60 fps).
 */
const SLERP_HEAD = 0.22;

/**
 * Tilt / suspension SLERP factor per frame.
 * Lower than heading: chassis tilts lazily like a physical mass-spring system
 * (≈0.4 s settle at 60 fps).
 */
const SLERP_TILT = 0.10;

// ─── Module-level scratch objects (zero GC per frame) ─────────────────────────

const _WORLD_UP   = new THREE.Vector3(0, 1, 0);

// Heading
const _rawHeadQ   = new THREE.Quaternion();
const _invSmoothH = new THREE.Quaternion();

// Wheel axes (derived from smoothed heading)
const _fwd        = new THREE.Vector3();
const _side       = new THREE.Vector3();

// 4 virtual wheel world positions
const _flPos      = new THREE.Vector3();
const _frPos      = new THREE.Vector3();
const _rlPos      = new THREE.Vector3();
const _rrPos      = new THREE.Vector3();

// Surface normal (world + local)
const _worldNorm  = new THREE.Vector3();
const _localNorm  = new THREE.Vector3();

// Rotation assembly
const _tiltQ      = new THREE.Quaternion();
const _chassisQ   = new THREE.Quaternion();
const _euler      = new THREE.Euler();

// Motion delta
const _posDelta   = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef = useRef(0);

  /** World-space position from the previous frame (for FD heading). */
  const prevPosRef = useRef<THREE.Vector3 | null>(null);

  /** Smoothed chassis centre Y (suspension spring). */
  const smoothY = useRef(0);

  /** Smoothed heading quaternion — Y-axis only (azimuth). */
  const smoothHeadingQ = useRef(new THREE.Quaternion());

  /** Smoothed full chassis quaternion (heading + pitch + roll). */
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

    // ── Advance progress ───────────────────────────────────────────────────────
    progressRef.current = Math.min(progressRef.current + ROVER_SPEED / curveLen, 1);

    const pos = curve.getPoint(progressRef.current);
    const tan = curve.getTangent(progressRef.current);

    // ── Step 1: Heading from finite-difference (smoother than CatmullRom tangent)
    let headingRad: number;
    if (prevPosRef.current) {
      _posDelta.subVectors(pos, prevPosRef.current);
      const dLen = _posDelta.length();
      headingRad = dLen > 0.0005
        ? Math.atan2(_posDelta.x, _posDelta.z)   // FD direction
        : Math.atan2(tan.x, tan.z);              // fallback: analytic tangent
    } else {
      headingRad = Math.atan2(tan.x, tan.z);
    }

    const headingDeg = ((headingRad * 180 / Math.PI) + 360) % 360;

    // Speed estimate (world-units/s at 60 fps)
    let speed = 0;
    if (prevPosRef.current) speed = pos.distanceTo(prevPosRef.current) * 60;
    prevPosRef.current = pos.clone();

    // ── Step 2: SLERP smoothHeadingQ toward raw heading ───────────────────────
    //
    // setFromAxisAngle(worldY, headingRad) → pure Y-axis (azimuth) quaternion.
    // Negate if dot < 0 to take the shortest arc (handles 359° → 0° wrap).
    _rawHeadQ.setFromAxisAngle(_WORLD_UP, headingRad);
    if (smoothHeadingQ.current.dot(_rawHeadQ) < 0) {
      _rawHeadQ.set(-_rawHeadQ.x, -_rawHeadQ.y, -_rawHeadQ.z, -_rawHeadQ.w);
    }
    smoothHeadingQ.current.slerp(_rawHeadQ, SLERP_HEAD);

    // ── Default chassis orientation (used when no terrain data) ───────────────
    _chassisQ.copy(smoothHeadingQ.current);

    // Default wheel heights (used for suspension reset + telemetry)
    let yFL = 0, yFR = 0, yRL = 0, yRR = 0;
    let centerY = pos.y;

    if (terrain?.heightMap) {
      const hm = terrain.heightMap;

      // ── Step 3: 4-wheel contact positions (using SMOOTHED heading axes) ──────
      //
      // Using smoothed axes (not raw headingRad) prevents wheel positions from
      // jumping abruptly at CatmullRom knot discontinuities.
      _fwd.set(0, 0, 1).applyQuaternion(smoothHeadingQ.current);
      _side.set(1, 0, 0).applyQuaternion(smoothHeadingQ.current);

      // Flatten to XZ — terrain height comes from getHeightAt, not from spline Y.
      _fwd.y = 0;  _fwd.normalize();
      _side.y = 0; _side.normalize();

      // Wheel contact world positions (XZ only — Y from getHeightAt below)
      _flPos.copy(pos).addScaledVector(_side, -WHEEL_HALF_WIDTH).addScaledVector(_fwd,  WHEEL_HALF_LENGTH); // front-left
      _frPos.copy(pos).addScaledVector(_side,  WHEEL_HALF_WIDTH).addScaledVector(_fwd,  WHEEL_HALF_LENGTH); // front-right
      _rlPos.copy(pos).addScaledVector(_side, -WHEEL_HALF_WIDTH).addScaledVector(_fwd, -WHEEL_HALF_LENGTH); // rear-left
      _rrPos.copy(pos).addScaledVector(_side,  WHEEL_HALF_WIDTH).addScaledVector(_fwd, -WHEEL_HALF_LENGTH); // rear-right

      // ── Step 4: Sample getHeightAt() at each wheel — pure CPU, no Raycaster ──
      //
      // getHeightAt bilinearly interpolates the CPU heightMap and adds the
      // sphere-curvature dip.  This is IDENTICAL to the value MoonTerrain.tsx
      // bakes into vertex Y, so wheels always contact the visual surface.
      yFL = getHeightAt(hm, _flPos.x, _flPos.z);
      yFR = getHeightAt(hm, _frPos.x, _frPos.z);
      yRL = getHeightAt(hm, _rlPos.x, _rlPos.z);
      yRR = getHeightAt(hm, _rrPos.x, _rrPos.z);

      // Chassis centre target Y = mean wheel contact Y + ground clearance offset
      centerY = (yFL + yFR + yRL + yRR) * 0.25 + TERRAIN_GROUND_OFFSET;

      // ── Step 5: Surface normal via getNormalAt() 3-point finite difference ────
      //
      // getNormalAt samples three micro-points around (pos.x, pos.z):
      //   p0 = (x,   h(x, z),      z  )
      //   pX = (x+δ, h(x+δ, z),    z  )
      //   pZ = (x,   h(x, z+δ),  z+δ  )
      // then computes (pZ-p0) × (pX-p0) → surface normal.
      //
      // The delta (0.25 m default) is small enough to resolve crater rims
      // but large enough to avoid sub-pixel noise in the 128×128 heightMap.
      //
      // Note: getNormalAt returns a REUSED scratch Vector3.  We must copy it
      // before the next call overwrites it.
      const rawNorm = getNormalAt(hm, pos.x, pos.z);
      _worldNorm.copy(rawNorm);  // copy from scratch before any other call

      // ── Step 6: Express world normal in SMOOTHED heading frame ───────────────
      //
      // The tilt quaternion must be built in the rover's local frame, not world
      // frame — otherwise the same physical slope looks different depending on
      // heading direction (root cause of the old tumbling bug).
      //
      // We use smoothHeadingQ (slow-filtered) as the reference frame.  This
      // prevents a stale inverse from causing a one-frame wrong tilt when the
      // raw heading jumps at path knots.
      _invSmoothH.copy(smoothHeadingQ.current).invert();
      _localNorm.copy(_worldNorm).applyQuaternion(_invSmoothH);

      // ── Step 7: Build tilt quaternion in heading-local frame ──────────────────
      //
      // _tiltQ rotates the rover's local Y (0,1,0) to point along _localNorm.
      // Composed with smoothHeadingQ in Step 8 → full chassis orientation.
      const dot = THREE.MathUtils.clamp(_localNorm.dot(_WORLD_UP), -1.0, 1.0);

      if (dot > 0.9999) {
        // Flat terrain — identity tilt
        _tiltQ.identity();
      } else if (dot < -0.9999) {
        // Theoretical inverted surface guard
        _tiltQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      } else {
        _tiltQ.setFromUnitVectors(_WORLD_UP, _localNorm.normalize());
      }

      // ── Step 8: Compose heading × tilt → final chassis quaternion ─────────────
      //
      // Convention: smoothHeadingQ (azimuth) applied first, _tiltQ (pitch+roll)
      // applied second IN THE HEADING-LOCAL FRAME:
      //   chassisQ = smoothHeadingQ × _tiltQ
      // Result: rover faces smoothed heading AND conforms to terrain normal.
      _chassisQ.copy(smoothHeadingQ.current).multiply(_tiltQ);
    }

    // ── Step 9: LERP chassis Y, SLERP full chassis orientation ────────────────
    //
    // smoothY: suspension spring — chassis Y settles to terrain contact slowly.
    // smoothQ: secondary damping on top of the pre-smoothed heading component.
    //   Heading response: ≈SLERP_HEAD (primary) + SLERP_TILT (secondary).
    //   Tilt response:    ≈SLERP_TILT only.
    smoothY.current += (centerY - smoothY.current) * LERP_Y;

    // Ensure SLERP takes shortest arc for full chassis quaternion
    if (smoothQ.current.dot(_chassisQ) < 0) {
      _chassisQ.set(-_chassisQ.x, -_chassisQ.y, -_chassisQ.z, -_chassisQ.w);
    }
    smoothQ.current.slerp(_chassisQ, SLERP_TILT);

    // ── Step 10: Extract XYZ Euler for <group rotation={[rx,ry,rz]}> ──────────
    //
    // THREE.js applies group rotation in intrinsic XYZ order (default).
    // Extracting XYZ from the quaternion guarantees an exact round-trip.
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
 * Uses getHeightAt() (same as rover) for accurate terrain-snapped Y values.
 * The heightMap fallback (p.y * heightScale) is used only before terrain loads.
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
      ? getHeightAt(heightMap, wx, wz) + ROUTE_Y_LIFT
      : p.y * heightScale + ROUTE_Y_LIFT;
    return new THREE.Vector3(wx, wy, wz);
  });
}
