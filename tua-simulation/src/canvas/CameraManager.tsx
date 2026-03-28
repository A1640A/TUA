'use client';
/**
 * CameraManager — First-Person / Orbit camera controller.
 *
 * Lives inside <Canvas> so it has full access to `useFrame` and `useThree`.
 *
 * In 'orbit' mode  → does nothing; OrbitControls governs the camera.
 * In 'fpv'   mode  → reads the rover's live world-space transform each frame,
 *                    positions the camera at the mast attachment point, and
 *                    applies the rover's full quaternion (yaw + pitch from terrain)
 *                    plus a subtle suspension-bob on the Y-axis.
 *
 * Transition:
 *   Orbit → FPV : lerp camera position from wherever it currently is into the
 *                 rover's mast position over ~60 frames (≈1 s at 60 fps).
 *   FPV → Orbit : lerp back to the snapshot that was captured when we left orbit.
 *
 * No additional npm packages are needed; all interpolation uses base THREE.js.
 */
import { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

// ── Constants ──────────────────────────────────────────────────────────────────
/** FOV used in FPV mode — wider than orbit to simulate a rover wide-angle lens. */
const FPV_FOV = 75;

/** Mast-mounted camera position in rover-local space (front, above body). */
const MAST_LOCAL = new THREE.Vector3(0.3, 1.08, -0.3);

/** Speed of the lerp blend (higher = faster snap). */
const LERP_SPEED = 0.055;

/** Maximum bobbing amplitude in Three.js units at full speed. */
const BOB_AMPLITUDE = 0.035;

/** Bobbing frequency in radians per second. */
const BOB_FREQUENCY = 8.0;

// ── Helpers ────────────────────────────────────────────────────────────────────
const _mastWorld  = new THREE.Vector3();
const _roverQuat  = new THREE.Quaternion();
const _roverEuler = new THREE.Euler();
const _bobOffset  = new THREE.Vector3();
const _targetPos  = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _forward    = new THREE.Vector3(0, 0, -1); // rover looks along -Z in its local frame

export default function CameraManager() {
  const { camera, gl } = useThree();

  const cameraMode = useSimulationStore(s => s.cameraMode);
  const roverState = useSimulationStore(s => s.roverState);

  // ── Transition state ──────────────────────────────────────────────────────
  /** Snapshot of camera position just before every orbit → FPV transition. */
  const orbitPosSnap  = useRef(new THREE.Vector3(...CAMERA_INITIAL_POSITION));
  /** Snapshot of camera quaternion just before transition. */
  const orbitQuatSnap = useRef(new THREE.Quaternion());
  /** lerp progress [0, 1] — 0 = fully at source, 1 = fully at target. */
  const transitionT   = useRef(1); // starts at 1 so first frame in orbit is instant
  /** Previous mode so we can detect changes. */
  const prevMode      = useRef<'orbit' | 'fpv'>('orbit');

  // ── React to mode changes ─────────────────────────────────────────────────
  useEffect(() => {
    if (cameraMode === prevMode.current) return;

    if (cameraMode === 'fpv') {
      // Snapshot the current orbit camera state before flying into FPV.
      orbitPosSnap.current.copy(camera.position);
      orbitQuatSnap.current.copy(camera.quaternion);
      transitionT.current = 0; // start lerp from orbit → FPV
    } else {
      // Flying back to orbit — start from wherever the camera currently is.
      transitionT.current = 0;
    }

    prevMode.current = cameraMode;
  }, [cameraMode, camera]);

  // ── Per-frame update ──────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Build rover world-space quaternion from Euler rotation stored in state.
    _roverEuler.set(
      roverState.rotation[0],
      roverState.rotation[1],
      roverState.rotation[2],
      'YXZ', // yaw first, then pitch — correct for a ground vehicle
    );
    _roverQuat.setFromEuler(_roverEuler);

    // Mast world position = rover position + local mast offset rotated by rover quat.
    _mastWorld.set(...roverState.position);
    _mastWorld.y += 0; // base is already the terrain-sampled Y
    const mastOffset = MAST_LOCAL.clone().applyQuaternion(_roverQuat);
    _mastWorld.add(mastOffset);

    // Suspension bob: sine wave on Y, amplitude scales with speed.
    const bobY = Math.sin(t * BOB_FREQUENCY) * BOB_AMPLITUDE * Math.min(roverState.speed * 15, 1);
    _bobOffset.set(0, bobY, 0);

    if (cameraMode === 'fpv') {
      // Target: mast world position + bob.
      _targetPos.copy(_mastWorld).add(_bobOffset);

      // Target rotation: rover quaternion (terrain pitch + heading yaw are both baked in).
      _targetQuat.copy(_roverQuat);

      // Advance transition.
      if (transitionT.current < 1) {
        transitionT.current = Math.min(transitionT.current + LERP_SPEED, 1);
      }

      const alpha = easeInOutCubic(transitionT.current);
      camera.position.lerp(_targetPos, alpha);
      camera.quaternion.slerp(_targetQuat, alpha);

      // Force FPV FOV during transition.
      if ((camera as THREE.PerspectiveCamera).fov !== FPV_FOV) {
        (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
          (camera as THREE.PerspectiveCamera).fov,
          FPV_FOV,
          alpha,
        );
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }

    } else {
      // Returning to orbit: lerp camera back to snapshotted position.
      if (transitionT.current < 1) {
        transitionT.current = Math.min(transitionT.current + LERP_SPEED * 0.8, 1);
        const alpha = easeInOutCubic(transitionT.current);
        camera.position.lerp(orbitPosSnap.current, alpha);
        camera.quaternion.slerp(orbitQuatSnap.current, alpha);

        // Restore orbit FOV.
        const targetFov = CAMERA_FOV;
        (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
          (camera as THREE.PerspectiveCamera).fov,
          targetFov,
          alpha,
        );
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
      // When transition finishes, OrbitControls takes over — no extra work needed.
    }

    // Prevent touch/mouse from feeding OrbitControls while we own the camera.
    // (OrbitControls is disabled via its `enabled` prop in Scene.tsx)
    void gl; // referenced to prevent tree-shake
  });

  return null; // no JSX — pure imperative camera control
}

// ── Pure helpers ───────────────────────────────────────────────────────────────
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
