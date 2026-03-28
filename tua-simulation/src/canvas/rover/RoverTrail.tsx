'use client';
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';
import { TRAIL_Y_LIFT } from '@/lib/constants';

/**
 * RoverTrail v2 — Renders the already-travelled portion of the route.
 *
 * Uses the same lifted points as RoutePath (via routePointsToVectors) so the
 * amber trail line is co-planar with the cyan route tube and never clips into
 * terrain.  An additional TRAIL_Y_LIFT offset shifts it 0.22 units higher.
 */
export default function RoverTrail() {
  const { routeResult, roverState } = useSimulationStore();

  const trailPoints = useMemo(() => {
    if (!routeResult?.path.length) return null;
    const all    = routePointsToVectors(routeResult.path);
    const cutOff = Math.ceil(all.length * roverState.pathProgress);
    const pts    = all.slice(0, Math.max(2, cutOff));
    // Apply additional trail lift so it sits just above the route tube
    return pts.map(v => new THREE.Vector3(v.x, v.y + TRAIL_Y_LIFT, v.z));
  }, [routeResult, roverState.pathProgress]);

  if (!trailPoints || trailPoints.length < 2) return null;

  return (
    <Line
      points={trailPoints}
      color="#f59e0b"
      lineWidth={2.5}
      dashed={false}
      renderOrder={3}
      depthWrite={false}
    />
  );
}
