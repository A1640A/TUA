'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSimulationStore } from '@/store/simulationStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';

export default function RoutePath() {
  const routeResult = useSimulationStore(s => s.routeResult);

  const points = useMemo(() => {
    if (!routeResult?.path.length || routeResult.path.length < 2) return null;
    const vecs = routePointsToVectors(routeResult.path);
    // Smooth with CatmullRom
    const curve = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
    return curve.getPoints(vecs.length * 3);
  }, [routeResult]);

  if (!points) return null;

  return (
    <Line
      points={points}
      color="#a78bfa"
      lineWidth={3}
      dashed={false}
    />
  );
}

/** Export the curve for rover animation use */
export function useRouteCurve(): THREE.CatmullRomCurve3 | null {
  const routeResult = useSimulationStore(s => s.routeResult);
  return useMemo(() => {
    if (!routeResult?.path.length || routeResult.path.length < 2) return null;
    const vecs = routePointsToVectors(routeResult.path);
    return new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
  }, [routeResult]);
}
