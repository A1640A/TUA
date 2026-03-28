'use client';
/**
 * SceneAnimator — bridge between application hooks and the R3F render loop.
 * Lives inside <Canvas> so it has access to useFrame.
 *
 * NOTE: useObstacleTrigger is intentionally NOT called here.
 * It lives in SimulationPage (outside Canvas) so it runs in the standard
 * React tree, where Zustand subscriptions are not throttled by the WebGL loop.
 *
 * v2 fix: useRouteCurve() now reads the terrain heightMap from terrainStore
 * and passes it to routePointsToVectors so every curve Y is computed via
 * getWorldY() — identical to the visual terrain geometry.  Without this,
 * the rover animation curve used the raw API p.y * heightScale which does NOT
 * include sphere-curvature dip, causing the rover body to sink into the mesh
 * at terrain edges where the curvature is strongest.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore }    from '@/store/terrainStore';
import { useRoverAnimation as _useRoverAnimation, routePointsToVectors } from '@/hooks/useRoverAnimation';

export function useRouteCurve(): THREE.CatmullRomCurve3 | null {
  const routeResult = useSimulationStore(s => s.routeResult);
  const terrain     = useTerrainStore(s => s.terrain);

  return useMemo(() => {
    if (!routeResult?.path || routeResult.path.length < 2) return null;
    // Pass heightMap so getWorldY() (terrain surface + sphere curvature) is used
    // for every point — the curve now lives in the EXACT same coordinate space
    // as the visual geometry and the 4-wheel raycasting physics.
    const hm   = terrain?.heightMap ?? undefined;
    const vecs = routePointsToVectors(routeResult.path, undefined, undefined, undefined, hm);
    return new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
  }, [routeResult, terrain]);
}

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const { animate } = _useRoverAnimation(curve);
  useFrame(() => animate());
}
