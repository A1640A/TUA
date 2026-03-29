'use client';
/**
 * CameraManager v6 — Restored FPV Mode for Main Canvas
 *
 * The FPV cockpit panel (CockpitPanel) shows an overhead view.
 * The main canvas supports FPV (first-person) mode via this manager.
 *
 * FPV Math:
 *  1. Rover heading = atan2 of rover forward XZ (terrain-tilt-free azimuth)
 *  2. Camera = rover roof position + heading + user yaw/pitch
 *  3. Terrain roll/pitch NOT inherited → stable, nausea-free horizon
 *  4. Left-click + pointer lock → free look
 *  5. Mode transition: smooth LERP/SLERP with easeInOutCubic
 */

import { useRef, useEffect, type RefObject } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Constants ──────────────────────────────────────────────────────────────────
const FPV_FOV        = 72;
const ROOF_LOCAL     = new THREE.Vector3(0, 1.35, 0);
const PITCH_DEFAULT  = -0.18;
const CAM_POS_LERP   = 0.10;
const CAM_ROT_SLERP  = 0.14;
const TRANSITION_SPD = 0.07;
const LOOK_SENSITIVITY = 0.003;
const MAX_YAW        = Math.PI;
const MAX_PITCH      = 1.3;
const LOOK_RESET     = 0.04;

// ── GC-free scratch ────────────────────────────────────────────────────────────
const _roofWorld  = new THREE.Vector3();
const _roofOffset = new THREE.Vector3();
const _roverEuler = new THREE.Euler();
const _roverQuat  = new THREE.Quaternion();
const _forward    = new THREE.Vector3();
const _headingQ   = new THREE.Quaternion();
const _yawQ       = new THREE.Quaternion();
const _pitchQ     = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _worldUp    = new THREE.Vector3(0, 1, 0);
const _pitchAxis  = new THREE.Vector3(1, 0, 0);

interface CameraManagerProps {
  orbitRef: RefObject<OrbitControlsImpl | null>;
}

export default function CameraManager({ orbitRef }: CameraManagerProps) {
  const { camera, gl } = useThree();
  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // ── Transition state ───────────────────────────────────────────────────────
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  const transitionT   = useRef(1.0);
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  // ── Camera buffers ─────────────────────────────────────────────────────────
  const smoothCamPos  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  const smoothCamQuat = useRef(new THREE.Quaternion());

  // ── Look state ─────────────────────────────────────────────────────────────
  const yawOffset     = useRef(0);
  const pitchOffset   = useRef(PITCH_DEFAULT);
  const pointerLocked = useRef(false);

  // ── Heading helper ─────────────────────────────────────────────────────────
  const getRoverHeadingRad = (rot: [number, number, number]): number => {
    _roverEuler.set(rot[0], rot[1], rot[2], 'XYZ');
    _roverQuat.setFromEuler(_roverEuler);
    _forward.set(0, 0, 1).applyQuaternion(_roverQuat);
    _forward.y = 0;
    if (_forward.lengthSq() < 0.0001) return 0;
    _forward.normalize();
    return Math.atan2(_forward.x, _forward.z);
  };

  // ── Pointer lock ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;
    const onMouseDown = (e: MouseEvent) => {
      if (cameraMode !== 'fpv') return;
      if (e.button === 0 && !pointerLocked.current) canvas.requestPointerLock();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (cameraMode !== 'fpv' || !pointerLocked.current) return;
      yawOffset.current   -= e.movementX * LOOK_SENSITIVITY;
      pitchOffset.current -= e.movementY * LOOK_SENSITIVITY;
      yawOffset.current   = THREE.MathUtils.clamp(yawOffset.current,   -MAX_YAW,   MAX_YAW);
      pitchOffset.current = THREE.MathUtils.clamp(pitchOffset.current, -MAX_PITCH, MAX_PITCH);
    };
    const onLockChange = () => { pointerLocked.current = document.pointerLockElement === canvas; };
    const onLockError  = () => { pointerLocked.current = false; };

    canvas.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', onLockError);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('pointerlockerror', onLockError);
    };
  }, [cameraMode, gl.domElement]);

  // ── Mode change ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;
    const orbit = orbitRef.current;

    if (cameraMode === 'fpv') {
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);

      const headingRad = getRoverHeadingRad(roverState.rotation as [number, number, number]);
      _headingQ.setFromAxisAngle(_worldUp, headingRad);
      _pitchAxis.set(1, 0, 0).applyQuaternion(_headingQ);
      _pitchQ.setFromAxisAngle(_pitchAxis, PITCH_DEFAULT);
      const initialQuat = _headingQ.clone().multiply(_pitchQ);

      _roverEuler.set(roverState.rotation[0], roverState.rotation[1], roverState.rotation[2], 'XYZ');
      _roverQuat.setFromEuler(_roverEuler);
      _roofOffset.copy(ROOF_LOCAL).applyQuaternion(_roverQuat);
      const initRoofPos = new THREE.Vector3(
        roverState.position[0], roverState.position[1], roverState.position[2],
      ).add(_roofOffset);

      smoothCamPos.current.copy(initRoofPos);
      smoothCamQuat.current.copy(initialQuat);
      transitionT.current  = 0;
      yawOffset.current    = 0;
      pitchOffset.current  = PITCH_DEFAULT;

      if (orbit) { orbit.saveState(); orbit.enabled = false; }
    } else {
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
      pointerLocked.current = false;
      yawOffset.current     = 0;
      pitchOffset.current   = PITCH_DEFAULT;
      transitionT.current   = 0;
      if (orbit) {
        orbit.enabled = true;
        orbit.reset();
        camera.position.copy(orbitPosSnap.current);
        camera.quaternion.copy(orbitQuatSnap.current);
        orbit.update();
      }
    }
    prevMode.current = cameraMode;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode, camera, orbitRef]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    };
  }, [gl.domElement]);

  // ── Per-frame update ───────────────────────────────────────────────────────
  useFrame(() => {
    if (cameraMode === 'orbit') return;

    _roverEuler.set(roverState.rotation[0], roverState.rotation[1], roverState.rotation[2], 'XYZ');
    _roverQuat.setFromEuler(_roverEuler);
    _roofOffset.copy(ROOF_LOCAL).applyQuaternion(_roverQuat);
    _roofWorld.set(roverState.position[0], roverState.position[1], roverState.position[2]).add(_roofOffset);

    if (transitionT.current < 1.0) transitionT.current = Math.min(transitionT.current + TRANSITION_SPD, 1.0);

    if (!pointerLocked.current) {
      yawOffset.current   *= (1 - LOOK_RESET);
      pitchOffset.current += (PITCH_DEFAULT - pitchOffset.current) * LOOK_RESET;
      if (Math.abs(yawOffset.current) < 0.0002) yawOffset.current = 0;
      if (Math.abs(pitchOffset.current - PITCH_DEFAULT) < 0.001) pitchOffset.current = PITCH_DEFAULT;
    }

    const headingRad = getRoverHeadingRad(roverState.rotation as [number, number, number]);
    _headingQ.setFromAxisAngle(_worldUp, headingRad);
    _yawQ.setFromAxisAngle(_worldUp, yawOffset.current);
    _targetQuat.copy(_headingQ).multiply(_yawQ);
    _pitchAxis.set(1, 0, 0).applyQuaternion(_targetQuat);
    _pitchQ.setFromAxisAngle(_pitchAxis, pitchOffset.current);
    _targetQuat.multiply(_pitchQ);

    smoothCamPos.current.lerp(_roofWorld, CAM_POS_LERP);
    if (smoothCamQuat.current.dot(_targetQuat) < 0)
      _targetQuat.set(-_targetQuat.x, -_targetQuat.y, -_targetQuat.z, -_targetQuat.w);
    smoothCamQuat.current.slerp(_targetQuat, CAM_ROT_SLERP);

    const alpha = easeInOutCubic(transitionT.current);
    if (transitionT.current >= 1.0) {
      camera.position.copy(smoothCamPos.current);
      camera.quaternion.copy(smoothCamQuat.current);
    } else {
      camera.position.lerpVectors(orbitPosSnap.current, smoothCamPos.current, alpha);
      camera.quaternion.slerpQuaternions(orbitQuatSnap.current, smoothCamQuat.current, alpha);
    }

    const camP = camera as THREE.PerspectiveCamera;
    if (Math.abs(camP.fov - FPV_FOV) > 0.05) {
      camP.fov = THREE.MathUtils.lerp(camP.fov, FPV_FOV, TRANSITION_SPD * 2);
      camP.updateProjectionMatrix();
    }
  });

  // Restore orbit FOV when in orbit mode
  useEffect(() => {
    if (cameraMode === 'orbit') {
      const cam = camera as THREE.PerspectiveCamera;
      if (Math.abs(cam.fov - CAMERA_FOV) > 0.1) {
        cam.fov = CAMERA_FOV;
        cam.updateProjectionMatrix();
      }
    }
  }, [cameraMode, camera]);

  return null;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
