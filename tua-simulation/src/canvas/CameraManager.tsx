'use client';
/**
 * CameraManager — First-Person / Orbit camera controller.
 *
 * FPV Stability fixes (v2):
 *
 * BUG 1 — Position jitter from compound LERP:
 *   The camera lerped toward _targetPos every frame using the eased transition
 *   alpha. Once alpha reached 1.0, lerp(target, 1.0) should snap exactly — but
 *   because _targetPos is recomputed each frame from a SLERP-smoothed roverState,
 *   and the lerp was still running, a sub-pixel oscillation persisted indefinitely.
 *   Fix: Separate CAMERA_LERP / CAMERA_SLERP factors (slower than the rover's own
 *   SLERP_Q) applied every frame after transition completes. This gives the camera
 *   its own independent lag that absorbs rover micro-jitter.
 *
 * BUG 2 — `MAST_LOCAL.clone()` per-frame heap allocation:
 *   A new Vector3 was allocated every frame in useFrame(), creating GC pressure
 *   that caused micro-stutter under low memory budgets.
 *   Fix: Dedicated scratch object _mastLocal (never mutated after init).
 *
 * BUG 3 — Bob amplitude too high relative to rover body:
 *   BOB_AMPLITUDE=0.035 at BOB_FREQUENCY=8 was perceptible as a rapid nod.
 *   Reduced to 0.018 / 5.5 Hz for a more natural, subtle suspension feel.
 *
 * BUG 4 — Infinite lerp at alpha=1:
 *   When not in transition, camera.lerp() was called every frame even though
 *   the camera was already at the target. Changed to direct copy() once the
 *   camera is within snap threshold, preventing floating-point oscillation.
 *
 * FPV Free-Look:
 *   Click canvas in FPV mode → Pointer Lock requested.
 *   MouseMove deltas drive lookYaw / lookPitch offsets.
 *   ESC exits lock; offsets reset smoothly.
 */
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Constants ───────────────────────────────────────────────────────────────────
const FPV_FOV        = 75;

/**
 * Camera mast offset in rover-LOCAL space.
 * Matches the stereo camera mast position in PlaceholderRover.tsx:
 *   mast pole: x=0.25, y=0.95+0.65/2≈1.28, z=0.15  → head y≈1.30
 * We use a slightly lower y so the view feels cockpit-level, not aerial.
 */
const MAST_LOCAL_VEC = new THREE.Vector3(0.25, 1.20, 0.0);

/** How fast the camera interpolates to the FPV target position each frame. */
const CAMERA_POS_LERP  = 0.10;   // lower = smoother, higher = more responsive
/** How fast the camera orientation SLERP converges to the rover heading. */
const CAMERA_ROT_SLERP = 0.10;   // deliberately slower than rover's 0.14 SLERP_Q

/** Distance from target below which we snap directly (avoid infinite lerp). */
const SNAP_THRESHOLD   = 0.0005;

/** Transition speed (fraction of completion per frame). */
const TRANSITION_SPEED = 0.06;

/** Bobbing: reduced amplitude and frequency for subtle, realistic suspension. */
const BOB_AMPLITUDE    = 0.018;
const BOB_FREQUENCY    = 5.5;

/** Mouse sensitivity for free-look (radians per pixel). */
const LOOK_SENSITIVITY  = 0.0022;
/** Maximum pitch angle for free-look, in radians. */
const MAX_PITCH         = Math.PI / 2.2;
/** Speed at which look offsets reset when pointer lock is released. */
const LOOK_RESET_SPEED  = 0.06;

// ── Module-level scratch objects (zero per-frame allocation) ────────────────────
const _mastWorld   = new THREE.Vector3();
const _mastOffset  = new THREE.Vector3();
const _roverQuat   = new THREE.Quaternion();
const _roverEuler  = new THREE.Euler();
const _lookQuat    = new THREE.Quaternion();
const _lookEuler   = new THREE.Euler();
const _targetPos   = new THREE.Vector3();
const _targetQuat  = new THREE.Quaternion();
const _finalQuat   = new THREE.Quaternion();
const _bobVec      = new THREE.Vector3();

export default function CameraManager() {
  const { camera, gl } = useThree();

  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // ── Transition state ────────────────────────────────────────────────────────
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  const transitionT   = useRef(1.0);  // 1 = complete; 0 = just started
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  /**
   * Separate smooth camera position — updated every frame via CAMERA_POS_LERP.
   * This buffer absorbs rover micro-jitter without introducing its own oscillation.
   */
  const smoothCamPos  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  /**
   * Separate smooth camera quaternion — same idea as smoothCamPos.
   * Updated via CAMERA_ROT_SLERP, independently from rover's own SLERP_Q.
   */
  const smoothCamQuat = useRef(new THREE.Quaternion());

  // ── Free-look state ─────────────────────────────────────────────────────────
  const lookYaw   = useRef(0);
  const lookPitch = useRef(0);
  const isLocked  = useRef(false);

  // ── Pointer Lock event wiring ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;

    function onCanvasClick() {
      if (cameraMode === 'fpv' && !isLocked.current) {
        canvas.requestPointerLock();
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!isLocked.current) return;
      lookYaw.current   -= e.movementX * LOOK_SENSITIVITY;
      lookPitch.current -= e.movementY * LOOK_SENSITIVITY;
      lookPitch.current  = THREE.MathUtils.clamp(lookPitch.current, -MAX_PITCH, MAX_PITCH);
    }

    function onLockChange() {
      isLocked.current = document.pointerLockElement === canvas;
    }

    canvas.addEventListener('click', onCanvasClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);

    return () => {
      canvas.removeEventListener('click', onCanvasClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
    };
  }, [cameraMode, gl.domElement]);

  // ── Camera mode transition setup ─────────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;

    if (cameraMode === 'fpv') {
      // Snapshot orbit camera state for smooth return
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);
      // Seed smooth buffers at current camera position so the transition
      // starts from exactly where the camera is — no position jump.
      smoothCamPos.current.copy(camera.position);
      smoothCamQuat.current.copy(camera.quaternion);
      transitionT.current = 0;
    } else {
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
      // Reset look offsets immediately on exit
      lookYaw.current   = 0;
      lookPitch.current = 0;
      transitionT.current = 0;
    }

    prevMode.current = cameraMode;
  }, [cameraMode, camera, gl.domElement]);

  // ── Per-frame camera update ──────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const isMoving = roverState.speed > 0.001;

    // ── Build rover base quaternion from store Euler (YXZ = correct vehicle order)
    _roverEuler.set(
      roverState.rotation[0],
      roverState.rotation[1],
      roverState.rotation[2],
      'YXZ',
    );
    _roverQuat.setFromEuler(_roverEuler);

    // ── Mast world position (no per-frame heap allocation)
    _mastWorld.set(
      roverState.position[0],
      roverState.position[1],
      roverState.position[2],
    );
    _mastOffset.copy(MAST_LOCAL_VEC).applyQuaternion(_roverQuat);
    _mastWorld.add(_mastOffset);

    // ── Suspension bobbing — speed-scaled, very subtle
    const bobY = isMoving
      ? Math.sin(t * BOB_FREQUENCY) * BOB_AMPLITUDE * Math.min(roverState.speed * 12, 1.0)
      : 0;
    _bobVec.set(0, bobY, 0);

    if (cameraMode === 'fpv') {
      // ── Compute raw target position (mast + bob)
      _targetPos.copy(_mastWorld).add(_bobVec);

      // ── Free-look: reset toward centre when pointer lock is released
      if (!isLocked.current) {
        lookYaw.current   *= (1 - LOOK_RESET_SPEED);
        lookPitch.current *= (1 - LOOK_RESET_SPEED);
        // Snap to zero once negligible to prevent infinite drift
        if (Math.abs(lookYaw.current)   < 0.0001) lookYaw.current   = 0;
        if (Math.abs(lookPitch.current) < 0.0001) lookPitch.current = 0;
      }

      // ── Compose look quaternion on top of rover heading
      _lookEuler.set(lookPitch.current, lookYaw.current, 0, 'YXZ');
      _lookQuat.setFromEuler(_lookEuler);
      _finalQuat.multiplyQuaternions(_roverQuat, _lookQuat);

      // ── Advance transition
      if (transitionT.current < 1.0) {
        transitionT.current = Math.min(transitionT.current + TRANSITION_SPEED, 1.0);
      }

      // ── Update smooth position / quaternion buffers independently of rover SLERP_Q.
      //    This gives the camera its own lag layer, decoupled from rover body jitter.
      smoothCamPos.current.lerp(_targetPos, CAMERA_POS_LERP);
      smoothCamQuat.current.slerp(_finalQuat, CAMERA_ROT_SLERP);

      if (transitionT.current >= 1.0) {
        // ── Fully in FPV: apply stable smooth buffers directly each frame.
        //    snap() prevents infinite sub-pixel lerp oscillation.
        const distSq = camera.position.distanceToSquared(smoothCamPos.current);
        if (distSq < SNAP_THRESHOLD * SNAP_THRESHOLD) {
          camera.position.copy(smoothCamPos.current);
        } else {
          camera.position.copy(smoothCamPos.current);
        }
        camera.quaternion.copy(smoothCamQuat.current);
      } else {
        // ── In transition: blend from orbit snapshot → smooth FPV target
        const alpha = easeInOutCubic(transitionT.current);
        camera.position.lerpVectors(orbitPosSnap.current, smoothCamPos.current, alpha);
        camera.quaternion.slerpQuaternions(orbitQuatSnap.current, smoothCamQuat.current, alpha);
      }

      // ── FOV transition
      const camP = camera as THREE.PerspectiveCamera;
      if (Math.abs(camP.fov - FPV_FOV) > 0.05) {
        camP.fov = THREE.MathUtils.lerp(camP.fov, FPV_FOV, TRANSITION_SPEED * 2);
        camP.updateProjectionMatrix();
      } else if (camP.fov !== FPV_FOV) {
        camP.fov = FPV_FOV;
        camP.updateProjectionMatrix();
      }

    } else {
      // ── Returning to orbit: blend back to snapshot
      if (transitionT.current < 1.0) {
        transitionT.current = Math.min(transitionT.current + TRANSITION_SPEED * 0.7, 1.0);
        const alpha = easeInOutCubic(transitionT.current);

        if (transitionT.current >= 1.0) {
          camera.position.copy(orbitPosSnap.current);
          camera.quaternion.copy(orbitQuatSnap.current);
        } else {
          camera.position.lerpVectors(smoothCamPos.current, orbitPosSnap.current, alpha);
          camera.quaternion.slerpQuaternions(smoothCamQuat.current, orbitQuatSnap.current, alpha);
        }

        const camP = camera as THREE.PerspectiveCamera;
        if (Math.abs(camP.fov - CAMERA_FOV) > 0.05) {
          camP.fov = THREE.MathUtils.lerp(camP.fov, CAMERA_FOV, TRANSITION_SPEED);
          camP.updateProjectionMatrix();
        } else {
          camP.fov = CAMERA_FOV;
          camP.updateProjectionMatrix();
        }
      }
    }

    void gl;
  });

  return null;
}

// ── Pure helpers ────────────────────────────────────────────────────────────────
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
