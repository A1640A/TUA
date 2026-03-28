'use client';
import { Suspense, useRef, Component, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';

import Lighting          from './environment/Lighting';
import SpaceEnvironment  from './environment/SpaceEnvironment';
import MoonTerrain, { type MoonTerrainHandle } from './terrain/MoonTerrain';
import ObstacleField     from './terrain/ObstacleField';
import Rover             from './rover/Rover';
import WheelTracks       from './rover/WheelTracks';
import RoutePath         from './route/RoutePath';
import Waypoints         from './route/Waypoints';
import PostProcessing    from './effects/PostProcessing';
import DustParticles     from './effects/DustParticles';
import ScanOverlay       from './effects/ScanOverlay';
import CameraManager     from './CameraManager';
import { useRoverAnimation, useRouteCurve } from './SceneAnimator';
import { useTerrain }    from '@/hooks/useTerrain';

// ─── PostProcessing error boundary ────────────────────────────────────────────
class PostProcessingErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) {
    if (err.message.includes('alpha') || err.message.includes('EffectComposer')) {
      this.setState({ hasError: false });
    }
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// ─── Stable GL config ─────────────────────────────────────────────────────────
const GL_CONFIG: THREE.WebGLRendererParameters = {
  antialias:       true,
  powerPreference: 'high-performance',
  stencil:         false,
  depth:           true,
  alpha:           false,
};

// ─── Scene Content ────────────────────────────────────────────────────────────
function SceneContent() {
  const terrainRef = useRef<MoonTerrainHandle>(null);

  /**
   * OrbitControls ref — passed to CameraManager so it can:
   *   • Call saveState() right before entering FPV (preserves orbit pose)
   *   • Force enabled=false imperatively during FPV to kill the damping loop
   *   • Call reset() + re-enable when returning to orbit
   *
   * NOTE: makeDefault is intentionally REMOVED from OrbitControls.
   * makeDefault registers OrbitControls as the R3F default controls, which
   * causes it to call update() every frame regardless of the `enabled` prop —
   * this overwrites camera.quaternion written by CameraManager in FPV mode.
   * Without makeDefault the orbit loop only runs when enabled=true.
   */
  const orbitRef = useRef<OrbitControlsImpl>(null);

  const curve = useRouteCurve();
  useRoverAnimation(curve);
  useTerrain();

  const placementMode   = useSimulationStore(s => s.placementMode);
  const placingObstacle = useObstacleStore(s => s.placingObstacle);
  const cameraMode      = useSimulationStore(s => s.cameraMode);
  const placing = !!(placementMode || placingObstacle);
  const isOrbit = cameraMode === 'orbit';

  return (
    <>
      <Lighting />
      <SpaceEnvironment />
      <MoonTerrain ref={terrainRef} />
      <ObstacleField />
      <WheelTracks />
      <Rover />
      <RoutePath />
      <Waypoints />
      <DustParticles />
      <ScanOverlay />
      <CameraManager orbitRef={orbitRef} />
      <OrbitControls
        ref={orbitRef}
        enabled={isOrbit && !placing}
        minDistance={6}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.1}
        enablePan={isOrbit && !placing}
        enableRotate={isOrbit && !placing}
        enableZoom={isOrbit}
        dampingFactor={0.08}
        enableDamping
        regress
      />
    </>
  );
}

// ─── Root Canvas ──────────────────────────────────────────────────────────────
export default function Scene() {
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ position: CAMERA_INITIAL_POSITION, fov: CAMERA_FOV, near: 0.1, far: 600 }}
      gl={GL_CONFIG}
      onCreated={({ gl }) => {
        gl.toneMapping         = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      style={{ background: '#03040e' }}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>

      <Suspense fallback={null}>
        <PostProcessingErrorBoundary>
          <PostProcessing />
        </PostProcessingErrorBoundary>
      </Suspense>
    </Canvas>
  );
}
