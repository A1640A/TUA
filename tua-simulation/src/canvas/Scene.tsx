'use client';
import { Suspense, useRef, Component, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
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

// ─── Stable GL config (never changes → no HMR renderer recreations) ──────────
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
      <CameraManager />
      <OrbitControls
        makeDefault
        enabled={isOrbit}
        minDistance={6}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2.1}
        enablePan={isOrbit && !placing}
        enableRotate={isOrbit && !placing}
        enableZoom={isOrbit}
        dampingFactor={0.08}
        enableDamping
      />
      {/* AdaptiveDpr WITHOUT pixelated — the pixelated prop was the main
          cause of the blocky pixel grid visible on the whole canvas. */}
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
