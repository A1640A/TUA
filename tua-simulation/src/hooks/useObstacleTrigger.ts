'use client';
import { useEffect, useRef } from 'react';
import { useObstacleStore } from '@/store/obstacleStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useRouteCalculation } from './useRouteCalculation';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';

/**
 * Watches the obstacle list for changes while the rover is actively navigating.
 * When a new obstacle is added during the `animating` state, this hook:
 *
 * 1. Sets status to `rerouting`.
 * 2. Updates the start waypoint to the rover's current approximate grid cell.
 * 3. Fires a new route calculation with `returnVisited = true` so the UI
 *    plays the A* scan animation on the bypass path.
 *
 * This creates the "drop a boulder in front of the rover → it stops and finds
 * a new way around" behaviour that is the centrepiece of the demo.
 */
export function useObstacleTrigger() {
  const obstacles       = useObstacleStore(s => s.obstacles);
  const prevCountRef    = useRef(obstacles.length);
  const { status, roverState, setStatus, setWaypoint } = useSimulationStore();
  const { calculate }   = useRouteCalculation();

  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = obstacles.length;

    // Only trigger reroute when an obstacle was *added* (not removed) while animating.
    if (obstacles.length <= prevCount) return;
    if (status !== 'animating') return;

    // Snap rover's current world position to nearest grid cell.
    const [rx, , rz] = roverState.position;
    const gx = Math.round((rx / TERRAIN_SCALE + 0.5) * GRID_SIZE);
    const gz = Math.round((rz / TERRAIN_SCALE + 0.5) * GRID_SIZE);
    const clampedX = Math.max(0, Math.min(GRID_SIZE - 1, gx));
    const clampedZ = Math.max(0, Math.min(GRID_SIZE - 1, gz));

    setStatus('rerouting');
    setWaypoint('start', { x: clampedX, z: clampedZ });

    // Brief pause so the user sees the "rerouting" banner before the API call.
    const timer = setTimeout(() => {
      calculate({ returnVisited: true });
    }, 600);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obstacles.length]);
}
