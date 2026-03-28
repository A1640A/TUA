'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { useSimulationStore } from '@/store/simulationStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';

export default function RoverTrail() {
  const { routeResult, roverState } = useSimulationStore();

  const trailPoints = useMemo(() => {
    if (!routeResult?.path.length) return null;
    const all = routePointsToVectors(routeResult.path);
    const cutOff = Math.ceil(all.length * roverState.pathProgress);
    return all.slice(0, Math.max(2, cutOff));
  }, [routeResult, roverState.pathProgress]);

  if (!trailPoints || trailPoints.length < 2) return null;

  return (
    <Line
      points={trailPoints}
      color="#f59e0b"
      lineWidth={2}
      dashed={false}
    />
  );
}
