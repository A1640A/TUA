'use client';
/**
 * SceneAnimator — bridge between application hooks and the R3F render loop.
 * Lives inside <Canvas> so it has access to useFrame.
 *
 * Also registers useObstacleTrigger here (inside the R3F context) so the
 * dynamic-reroute logic has access to the same React tree as the animation loop.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useRoverAnimation as _useRoverAnimation, routePointsToVectors } from '@/hooks/useRoverAnimation';
import { useObstacleTrigger } from '@/hooks/useObstacleTrigger';

export function useRouteCurve(): THREE.CatmullRomCurve3 | null {
  const routeResult = useSimulationStore(s => s.routeResult);
  return useMemo(() => {
    if (!routeResult?.path || routeResult.path.length < 2) return null;
    const vecs = routePointsToVectors(routeResult.path);
    return new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
  }, [routeResult]);
}

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const { animate } = _useRoverAnimation(curve);
  // Run the obstacle-triggered reroute watcher alongside the animation loop.
  useObstacleTrigger();
  useFrame(() => animate());
}
