'use client';
/**
 * CameraManager — First-Person / Orbit camera controller.
 *
 * FPV Free-Look:
 *   Click anywhere on the canvas while in FPV mode → Pointer Lock is requested.
 *   MouseMove deltas update lookYaw / lookPitch offsets which are composed on
 *   top of the rover's base quaternion every frame.
 *   ESC (browser default) exits pointer lock; the look offsets smoothly reset.
 *
 * Transition:
 *   Orbit → FPV : position lerp + quaternion slerp over ~60 frames.
 *   FPV → Orbit : lerp back to pre-transition snapshot.
 */
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Constants ──────────────────────────────────────────────────────────────────
const FPV_FOV        = 75;
const MAST_LOCAL     = new THREE.Vector3(0.3, 1.08, -0.3);
const LERP_SPEED     = 0.055;
const BOB_AMPLITUDE  = 0.035;
const BOB_FREQUENCY  = 8.0;

/** Mouse sensitivity for free-look (radians per pixel). */
const LOOK_SENSITIVITY = 0.0022;
/** Maximum pitch angle up/down (radians). */
const MAX_PITCH = Math.PI / 2.2;  // ≈ 82°
/** How fast look offsets return to centre when pointer lock is released. */
const LOOK_RESET_SPEED = 0.06;

// ── Module-level scratch objects (avoid per-frame GC) ─────────────────────────
const _mastWorld   = new THREE.Vector3();
const _roverQuat   = new THREE.Quaternion();
const _roverEuler  = new THREE.Euler();
const _lookQuat    = new THREE.Quaternion();
const _lookEuler   = new THREE.Euler();
const _bobOffset   = new THREE.Vector3();
const _targetPos   = new THREE.Vector3();
const _targetQuat  = new THREE.Quaternion();
const _finalQuat   = new THREE.Quaternion();

export default function CameraManager() {
  const { camera, gl } = useThree();

  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // ── Transition state ──────────────────────────────────────────────────────
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  const transitionT   = useRef(1);
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  // ── Free-look state ───────────────────────────────────────────────────────
  /** Accumulated yaw offset from mouse movement (radians). */
  const lookYaw   = useRef(0);
  /** Accumulated pitch offset from mouse movement (radians). */
  const lookPitch = useRef(0);
  /** Whether the browser Pointer Lock is currently active. */
  const isLocked  = useRef(false);

  // ── Pointer Lock setup ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;

    /** Request lock when user clicks the canvas in FPV mode. */
    function onCanvasClick() {
      if (cameraMode === 'fpv' && !isLocked.current) {
        canvas.requestPointerLock();
      }
    }

    /** Accumulate look deltas while pointer is locked. */
    function onMouseMove(e: MouseEvent) {
      if (!isLocked.current) return;
      lookYaw.current   -= e.movementX * LOOK_SENSITIVITY;
      lookPitch.current -= e.movementY * LOOK_SENSITIVITY;
      // Clamp pitch so you can't flip the camera.
      lookPitch.current = THREE.MathUtils.clamp(lookPitch.current, -MAX_PITCH, MAX_PITCH);
    }

    /** Track lock state changes. */
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

  // ── React to camera mode changes ─────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;

    if (cameraMode === 'fpv') {
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);
      transitionT.current = 0;
    } else {
      // Leaving FPV — exit pointer lock if active and reset look offsets.
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
      transitionT.current = 0;
    }

    prevMode.current = cameraMode;
  }, [cameraMode, camera, gl.domElement]);

  // ── Per-frame update ──────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Rover base quaternion from store Euler.
    _roverEuler.set(
      roverState.rotation[0],
      roverState.rotation[1],
      roverState.rotation[2],
      'YXZ',
    );
    _roverQuat.setFromEuler(_roverEuler);

    // Mast world position.
    _mastWorld.set(...roverState.position);
    const mastOffset = MAST_LOCAL.clone().applyQuaternion(_roverQuat);
    _mastWorld.add(mastOffset);

    // Suspension bobbing.
    const bobY = Math.sin(t * BOB_FREQUENCY) * BOB_AMPLITUDE * Math.min(roverState.speed * 15, 1);
    _bobOffset.set(0, bobY, 0);

    if (cameraMode === 'fpv') {
      _targetPos.copy(_mastWorld).add(_bobOffset);

      // ── Compose look offset on top of rover quaternion ──────────────────
      // When pointer lock is NOT active, smoothly reset look back to centre.
      if (!isLocked.current) {
        lookYaw.current   *= (1 - LOOK_RESET_SPEED);
        lookPitch.current *= (1 - LOOK_RESET_SPEED);
      }

      // Build look rotation: yaw around world-Y, pitch around local-X.
      _lookEuler.set(lookPitch.current, lookYaw.current, 0, 'YXZ');
      _lookQuat.setFromEuler(_lookEuler);

      // Final camera quat = rover base × look offset.
      _finalQuat.multiplyQuaternions(_roverQuat, _lookQuat);
      _targetQuat.copy(_finalQuat);

      // Advance transition.
      if (transitionT.current < 1) {
        transitionT.current = Math.min(transitionT.current + LERP_SPEED, 1);
      }

      const alpha = easeInOutCubic(transitionT.current);
      camera.position.lerp(_targetPos, alpha);
      camera.quaternion.slerp(_targetQuat, alpha);

      // Lerp FOV toward FPV value.
      const camP = camera as THREE.PerspectiveCamera;
      if (Math.abs(camP.fov - FPV_FOV) > 0.01) {
        camP.fov = THREE.MathUtils.lerp(camP.fov, FPV_FOV, alpha);
        camP.updateProjectionMatrix();
      }

    } else {
      // Returning to orbit.
      if (transitionT.current < 1) {
        transitionT.current = Math.min(transitionT.current + LERP_SPEED * 0.8, 1);
        const alpha = easeInOutCubic(transitionT.current);
        camera.position.lerp(orbitPosSnap.current, alpha);
        camera.quaternion.slerp(orbitQuatSnap.current, alpha);

        const camP = camera as THREE.PerspectiveCamera;
        camP.fov = THREE.MathUtils.lerp(camP.fov, CAMERA_FOV, alpha);
        camP.updateProjectionMatrix();
      }
    }

    void gl;
  });

  return null;
}

// ── Pure helpers ───────────────────────────────────────────────────────────────
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
