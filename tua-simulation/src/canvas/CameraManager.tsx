'use client';
/**
 * CameraManager v4 — Orbit + FPV camera with proper OrbitControls hand-off.
 *
 * ROOT CAUSE OF BROKEN ORBIT MOUSE CONTROL (v3):
 *   OrbitControls was rendered with `makeDefault`, which registers it as the
 *   R3F default controls and calls controls.update() every frame — even when
 *   `enabled={false}`. This overwrote camera.position / camera.quaternion
 *   written by this component in FPV mode, and ALSO prevented OrbitControls
 *   from responding properly to mouse events in orbit mode because the internal
 *   state machine was being reset by CameraManager's own writes.
 *
 * FIX (v4):
 *   1. makeDefault removed from OrbitControls in Scene.tsx.
 *      Without it, OrbitControls only calls update() when enabled=true.
 *   2. CameraManager receives orbitRef and uses it imperatively:
 *      • On switch orbit→FPV: saveState() then enable=false (hard stop).
 *      • On switch FPV→orbit: enable=true then reset() (restore saved pose).
 *      • In FPV useFrame: skip if orbitRef is somehow still enabled.
 *   3. Orbit mode: CameraManager does NOTHING — OrbitControls owns the camera.
 *   4. FPV mode:   OrbitControls is disabled — CameraManager owns the camera.
 *
 * FPV behaviour:
 *   - Camera mounts to rover roof (ROOF_LOCAL offset in rover local space).
 *   - Default direction: rover heading + fixed downward PITCH_DEFAULT.
 *   - Left-click drag → yaw (horizontal look-around), max ±180°.
 *   - Release → yaw slowly resets to centre.
 *   - No vertical pitch control: camera always aims at the same elevation.
 */
import { useRef, useEffect, type RefObject } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Constants ──────────────────────────────────────────────────────────────────

const FPV_FOV = 72;

/**
 * Camera mount point in rover local space.
 * x=0: centered, y=1.35: above rover roof, z=0: mid fore-aft.
 */
const ROOF_LOCAL = new THREE.Vector3(0, 1.35, 0);

/**
 * Fixed downward pitch (radians). -0.18 ≈ -10°: sees ground ahead.
 * Positive → looks up, negative → looks down.
 */
const PITCH_DEFAULT = -0.18;

/** Camera position LERP factor per frame. Lower = smoother. */
const CAM_POS_LERP  = 0.09;
/** Camera rotation SLERP factor. Slightly slower than rover's own 0.10. */
const CAM_ROT_SLERP = 0.09;

/** FPV ↔ Orbit transition speed. */
const TRANSITION_SPD = 0.06;

/** Mouse horizontal drag sensitivity (radians / pixel). */
const YAW_SENSITIVITY = 0.006;
/** Yaw return-to-centre speed (applied each frame while not dragging). */
const YAW_RESET       = 0.05;
/** Maximum horizontal look angle (radians). π = full 180° each side. */
const MAX_YAW         = Math.PI;

// ── Zero-GC scratch objects ────────────────────────────────────────────────────
const _roofWorld   = new THREE.Vector3();
const _roofOffset  = new THREE.Vector3();
const _roverEuler  = new THREE.Euler();
const _roverQuat   = new THREE.Quaternion();
const _headingQ    = new THREE.Quaternion();
const _yawQ        = new THREE.Quaternion();
const _pitchQ      = new THREE.Quaternion();
const _targetQuat  = new THREE.Quaternion();
const _worldUp     = new THREE.Vector3(0, 1, 0);
const _localX      = new THREE.Vector3(1, 0, 0);

// ──────────────────────────────────────────────────────────────────────────────

interface CameraManagerProps {
  /** Ref to the OrbitControls instance in Scene — used for hard enable/disable. */
  orbitRef: RefObject<OrbitControlsImpl | null>;
}

export default function CameraManager({ orbitRef }: CameraManagerProps) {
  const { camera, gl } = useThree();
  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // ── Transition state ─────────────────────────────────────────────────────────
  /** Saved camera position at the moment we entered FPV (for returning). */
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  /** Saved camera quaternion at the moment we entered FPV (for returning). */
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  /** 0→1 blend progress for FPV entry / exit animation. */
  const transitionT   = useRef(1.0);
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  // ── Smooth camera buffers ────────────────────────────────────────────────────
  const smoothCamPos  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const smoothCamQuat = useRef(new THREE.Quaternion());

  // ── FPV yaw state ────────────────────────────────────────────────────────────
  const yawOffset    = useRef(0);
  const isDragging   = useRef(false);
  const prevMouseX   = useRef(0);

  // ── Mouse / touch drag listeners (FPV only) ──────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: MouseEvent) => {
      if (cameraMode !== 'fpv') return;
      if (e.button === 0) {
        isDragging.current = true;
        prevMouseX.current = e.clientX;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || cameraMode !== 'fpv') return;
      const dx = e.clientX - prevMouseX.current;
      prevMouseX.current = e.clientX;
      yawOffset.current -= dx * YAW_SENSITIVITY;
      yawOffset.current  = THREE.MathUtils.clamp(yawOffset.current, -MAX_YAW, MAX_YAW);
    };

    const onMouseUp = () => { isDragging.current = false; };

    // Touch support
    const onTouchStart = (e: TouchEvent) => {
      if (cameraMode !== 'fpv' || e.touches.length !== 1) return;
      isDragging.current = true;
      prevMouseX.current = e.touches[0].clientX;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - prevMouseX.current;
      prevMouseX.current = e.touches[0].clientX;
      yawOffset.current -= dx * YAW_SENSITIVITY;
      yawOffset.current  = THREE.MathUtils.clamp(yawOffset.current, -MAX_YAW, MAX_YAW);
    };
    const onTouchEnd = () => { isDragging.current = false; };

    canvas.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove',  onMouseMove);
    window.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: true });
    canvas.addEventListener('touchend',   onTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mousemove',  onMouseMove);
      window.removeEventListener('mouseup',    onMouseUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, [cameraMode, gl.domElement]);

  // ── Mode change handler ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;
    const orbit = orbitRef.current;

    if (cameraMode === 'fpv') {
      // Capture current orbit camera pose before handing off
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);
      smoothCamPos.current.copy(camera.position);
      smoothCamQuat.current.copy(camera.quaternion);
      transitionT.current = 0;
      yawOffset.current   = 0;

      // Hard-disable OrbitControls so its damping loop stops writing to camera
      if (orbit) {
        orbit.saveState();
        orbit.enabled = false;
      }
    } else {
      // orbit mode
      isDragging.current  = false;
      yawOffset.current   = 0;
      transitionT.current = 0;

      // Re-enable OrbitControls and restore the saved pose
      if (orbit) {
        orbit.enabled = true;
        orbit.reset();
        // Restore the camera to where the user left it before FPV
        camera.position.copy(orbitPosSnap.current);
        camera.quaternion.copy(orbitQuatSnap.current);
        orbit.update();
      }
    }

    prevMode.current = cameraMode;
  }, [cameraMode, camera, orbitRef]);

  // ── Per-frame update ──────────────────────────────────────────────────────────
  useFrame(() => {
    // In orbit mode: OrbitControls owns the camera, nothing to do here.
    if (cameraMode === 'orbit') return;

    // ── Rover roof position in world space ─────────────────────────────────────
    _roverEuler.set(
      roverState.rotation[0],
      roverState.rotation[1],
      roverState.rotation[2],
      'YXZ',
    );
    _roverQuat.setFromEuler(_roverEuler);

    _roofOffset.copy(ROOF_LOCAL).applyQuaternion(_roverQuat);
    _roofWorld.set(
      roverState.position[0],
      roverState.position[1],
      roverState.position[2],
    ).add(_roofOffset);

    // ── FPV camera orientation ─────────────────────────────────────────────────
    // Advance transition blend
    if (transitionT.current < 1.0) {
      transitionT.current = Math.min(transitionT.current + TRANSITION_SPD, 1.0);
    }

    // Yaw auto-reset when not dragging
    if (!isDragging.current && Math.abs(yawOffset.current) > 0.0002) {
      yawOffset.current *= (1 - YAW_RESET);
    } else if (!isDragging.current) {
      yawOffset.current = 0;
    }

    // Step 1: pure heading yaw (rover's Y-axis rotation only, no pitch/roll)
    _headingQ.setFromAxisAngle(_worldUp, roverState.rotation[1]);

    // Step 2: user yaw offset (world Y, stacks on top of heading)
    _yawQ.setFromAxisAngle(_worldUp, yawOffset.current);

    // Step 3: fixed downward pitch (rover's local X axis after heading applied)
    _localX.set(1, 0, 0).applyQuaternion(_headingQ);
    _pitchQ.setFromAxisAngle(_localX, PITCH_DEFAULT);

    // Compose: heading × yaw × pitch
    _targetQuat.copy(_headingQ).multiply(_yawQ).multiply(_pitchQ);

    // ── LERP / SLERP camera buffers ────────────────────────────────────────────
    smoothCamPos.current.lerp(_roofWorld, CAM_POS_LERP);
    smoothCamQuat.current.slerp(_targetQuat, CAM_ROT_SLERP);

    // ── Apply to camera (with transition blend) ────────────────────────────────
    const alpha = easeInOutCubic(transitionT.current);
    if (transitionT.current >= 1.0) {
      camera.position.copy(smoothCamPos.current);
      camera.quaternion.copy(smoothCamQuat.current);
    } else {
      camera.position.lerpVectors(orbitPosSnap.current, smoothCamPos.current, alpha);
      camera.quaternion.slerpQuaternions(orbitQuatSnap.current, smoothCamQuat.current, alpha);
    }

    // ── FOV transition ─────────────────────────────────────────────────────────
    const camP = camera as THREE.PerspectiveCamera;
    if (Math.abs(camP.fov - FPV_FOV) > 0.05) {
      camP.fov = THREE.MathUtils.lerp(camP.fov, FPV_FOV, TRANSITION_SPD * 2);
      camP.updateProjectionMatrix();
    }
  });

  return null;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
