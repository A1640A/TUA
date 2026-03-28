'use client';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, AdaptiveDpr } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_INITIAL_POSITION, CAMERA_FOV } from '@/lib/constants';

import Lighting       from './environment/Lighting';
import StarField      from './environment/StarField';
import EarthInSky     from './environment/EarthInSky';
import MoonTerrain    from './terrain/MoonTerrain';
import CraterField    from './terrain/CraterField';
import Rover          from './rover/Rover';
import RoverTrail     from './rover/RoverTrail';
import RoutePath      from './route/RoutePath';
import Waypoints      from './route/Waypoints';
import PostProcessing from './effects/PostProcessing';
import DustParticles  from './effects/DustParticles';
import { useRoverAnimation, useRouteCurve } from './SceneAnimator';
import { useTerrain }    from '@/hooks/useTerrain';

function SceneContent() {
  const curve = useRouteCurve();
  useRoverAnimation(curve);
  useTerrain();

  return (
    <>
      <Lighting />
      <StarField />
      <EarthInSky />
      <MoonTerrain />
      <CraterField />
      <Rover />
      <RoverTrail />
      <RoutePath />
      <Waypoints />
      <DustParticles />
      <OrbitControls
        makeDefault
        minDistance={8}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.05}
        enablePan={true}
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
