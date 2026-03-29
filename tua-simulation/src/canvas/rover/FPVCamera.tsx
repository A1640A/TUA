'use client';
/**
 * OverheadCamera — Bird's-Eye Rover-Tracking Camera for the Cockpit Panel.
 *
 * Positions the mini-canvas camera directly above the rover and looks down,
 * creating a real-time satellite/drone following view.
 *
 * Camera Math:
 *  1. Read rover world position from roverRefStore (updated every frame by PlaceholderRover).
 *  2. Camera position = rover XZ + fixed overhead height (Y), no pitch/roll inheritance.
 *  3. Camera always looks straight down (-Y) with north (+Z) as "up" in screen.
 *  4. LERP position for smooth, lag-free following.
 *  5. Zoom (height) can be adjusted via the OVERHEAD_HEIGHT constant.
 */

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRoverRefStore } from '@/store/roverRefStore';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Height above the rover in world units. Lower = closer zoom. */
const OVERHEAD_HEIGHT = 8;

/** Horizontal LERP speed — how fast the camera follows the rover (0–1 per frame). */
const POS_LERP = 0.08;

/** Camera FOV for the overhead view. Narrower = more zoomed in. */
const OVERHEAD_FOV = 38;

// GC-free scratch
const _roverPos  = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _matDecomp = new THREE.Quaternion();
const _scaleTemp = new THREE.Vector3();
const _mat4      = new THREE.Matrix4();

// ────────────────────────────────────────────────────────────────────────────

export default function OverheadCamera() {
  const { camera } = useThree();
  const worldMatrix = useRoverRefStore(s => s.worldMatrix);

  const smoothPos = useRef(new THREE.Vector3(0, OVERHEAD_HEIGHT, 0));
  const isReady   = useRef(false);

  // ── Configure camera once ─────────────────────────────────────────────────
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov  = OVERHEAD_FOV;
    cam.near = 0.5;
    cam.far  = 600;
    cam.updateProjectionMatrix();

    // Look straight down, north (+Z) is "up" on screen
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // ── Every frame: follow rover from above ─────────────────────────────────
  useFrame(() => {
    // Decompose rover world matrix to get position only
    _mat4.fromArray(worldMatrix);
    _mat4.decompose(_roverPos, _matDecomp, _scaleTemp);

    // Target position is directly above the rover
    _camTarget.set(_roverPos.x, _roverPos.y + OVERHEAD_HEIGHT, _roverPos.z);

    // First-frame snap (no lerp on initial position)
    if (!isReady.current && _roverPos.lengthSq() > 0.001) {
      smoothPos.current.copy(_camTarget);
      isReady.current = true;
    }

    // Smooth LERP follow
    smoothPos.current.lerp(_camTarget, POS_LERP);

    camera.position.copy(smoothPos.current);

    // Always look down at rover's current XZ + terrain Y
    camera.lookAt(_roverPos.x, _roverPos.y, _roverPos.z);
    camera.up.set(0, 0, 1); // keep north "up" on screen
  });

  return null;
}
