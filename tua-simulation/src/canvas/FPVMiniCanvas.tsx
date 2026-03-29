'use client';
/**
 * FPVMiniCanvas — Second WebGL Context for the Overhead Rover Tracking Panel.
 *
 * Renders the rover and terrain from a bird's-eye view, following the rover
 * in real-time. This is completely separate from the main canvas so it has
 * its own WebGL context and does not interfere with the main scene's camera
 * or OrbitControls.
 *
 * Scene Content:
 *  - FPVMiniTerrain: half-resolution lunar surface
 *  - Rover: full rover model (reads roverState from store, same as main canvas)
 *  - Lighting: same solar model as main scene
 *  - SpaceEnvironment: star field
 *  - OverheadCamera: reads rover world position, positions itself above
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

import Lighting         from './environment/Lighting';
import SpaceEnvironment from './environment/SpaceEnvironment';
import FPVMiniTerrain   from './terrain/FPVMiniTerrain';
import OverheadCamera   from './rover/FPVCamera';
import Rover            from './rover/Rover';

// ─── GL config ────────────────────────────────────────────────────────────────
const FPV_GL_CONFIG: THREE.WebGLRendererParameters = {
  antialias:       true,
  powerPreference: 'high-performance',
  stencil:         false,
  depth:           true,
  alpha:           true,
};

export default function FPVMiniCanvas() {
  return (
    <Canvas
      camera={{
        fov:      38,
        near:     0.5,
        far:      600,
        position: [0, 8, 0],
      }}
      gl={FPV_GL_CONFIG}
      shadows={{ type: THREE.PCFSoftShadowMap }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping         = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.setClearColor(0x03040e, 1);
        // Point camera down at origin initially
        camera.up.set(0, 0, 1);
        camera.lookAt(0, 0, 0);
      }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <Suspense fallback={null}>
        {/* Same solar lighting as main scene */}
        <Lighting />

        {/* Star field */}
        <SpaceEnvironment />

        {/* Optimised half-resolution lunar surface */}
        <FPVMiniTerrain />

        {/* Rover — reads roverState from simulationStore, same as main canvas */}
        <Rover />

        {/* Overhead tracking camera — smoothly follows rover from above */}
        <OverheadCamera />
      </Suspense>
    </Canvas>
  );
}
