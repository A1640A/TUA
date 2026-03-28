'use client';
/**
 * SceneAnimator — bridge between application hooks and the R3F render loop.
 * Lives inside <Canvas> so it has access to useFrame.
 *
 * NOTE: useObstacleTrigger is intentionally NOT called here.
 * It lives in SimulationPage (outside Canvas) so it runs in the standard
 * React tree, where Zustand subscriptions are not throttled by the WebGL loop.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useRoverAnimation as _useRoverAnimation, routePointsToVectors } from '@/hooks/useRoverAnimation';

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
  useFrame(() => animate());
}
