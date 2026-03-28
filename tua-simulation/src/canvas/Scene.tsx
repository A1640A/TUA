'use client';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr } from '@react-three/drei';
import * as THREE from 'three';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';

import Lighting       from './environment/Lighting';
import StarField      from './environment/StarField';
import EarthInSky     from './environment/EarthInSky';
import MoonTerrain    from './terrain/MoonTerrain';
// CraterField removed — danger rings hidden per user request.
import ObstacleField  from './terrain/ObstacleField';
import Rover          from './rover/Rover';
import RoverTrail     from './rover/RoverTrail';
import RoutePath      from './route/RoutePath';
import Waypoints      from './route/Waypoints';
import PostProcessing from './effects/PostProcessing';
import DustParticles  from './effects/DustParticles';
import ScanOverlay    from './effects/ScanOverlay';
import CameraManager  from './CameraManager';
import { useRoverAnimation, useRouteCurve } from './SceneAnimator';
import { useTerrain }    from '@/hooks/useTerrain';

function SceneContent() {
  const curve = useRouteCurve();
  useRoverAnimation(curve);
  useTerrain();

  const placementMode    = useSimulationStore(s => s.placementMode);
  const placingObstacle  = useObstacleStore(s => s.placingObstacle);
  const cameraMode       = useSimulationStore(s => s.cameraMode);
  const placing = !!(placementMode || placingObstacle);
  const isOrbit = cameraMode === 'orbit';

  return (
    <>
      <Lighting />
      <StarField />
      <EarthInSky />
      <MoonTerrain />
      <ObstacleField />
      <Rover />
      <RoverTrail />
      <RoutePath />
      <Waypoints />
      <DustParticles />
      <ScanOverlay />
      {/* CameraManager handles FPV camera take-over and smooth transitions. */}
      <CameraManager />
      <OrbitControls
        makeDefault
        enabled={isOrbit}
        minDistance={8}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.05}
        enablePan={isOrbit && !placing}
        enableRotate={isOrbit && !placing}
        enableZoom={isOrbit}
        dampingFactor={0.08}
        enableDamping
      />
      <AdaptiveDpr pixelated />
    </>
  );
}

export default function Scene() {
  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_INITIAL_POSITION, fov: CAMERA_FOV, near: 0.1, far: 600 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ background: '#080810' }}
    >
      <Suspense fallback={null}>
        <SceneContent />
        <PostProcessing />
      </Suspense>
    </Canvas>
  );
}
