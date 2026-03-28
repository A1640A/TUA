'use client';
import { useEffect, useRef } from 'react';
import { useObstacleStore } from '@/store/obstacleStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useRouteCalculation } from './useRouteCalculation';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';

/**
 * Robust obstacle-triggered reroute.
 *
 * Uses Zustand's `subscribe` API (not `useEffect`) so it fires SYNCHRONOUSLY
 * the moment an obstacle is added — before any React render cycle, before
 * any batching delay. This is the most reliable way to react to Zustand changes
 * that need to trigger async work (API calls).
 */
export function useObstacleTrigger() {
  const pendingRef = useRef(false);
  const { calculate } = useRouteCalculation();

  // Keep a stable ref to calculate so the subscribe callback always has the
  // latest closure (including latest obstacles/waypoints/terrain).
  const calculateRef = useRef(calculate);
  useEffect(() => { calculateRef.current = calculate; }, [calculate]);

  useEffect(() => {
    let prevCount = useObstacleStore.getState().obstacles.length;

    // Subscribe directly to the Zustand store — fires synchronously on every
    // state change, bypassing React's render scheduling entirely.
    const unsubscribe = useObstacleStore.subscribe((state) => {
      // Obstacle was removed or unchanged.
      if (state.obstacles.length <= prevCount) {
        prevCount = state.obstacles.length;
        return;
      }
      prevCount = state.obstacles.length;

      // Read simulation state imperatively — zero stale closure risk.
      const sim = useSimulationStore.getState();

      // Only reroute when rover is actively driving.
      if (sim.status !== 'animating') return;

      // Prevent double-trigger if user drops obstacles in rapid succession.
      if (pendingRef.current) return;
      pendingRef.current = true;

      // Snap rover world-space position to nearest grid cell.
      const [rx, , rz] = sim.roverState.position;
      const newStartX = Math.max(0, Math.min(GRID_SIZE - 1,
        Math.round((rx / TERRAIN_SCALE + 0.5) * GRID_SIZE),
      ));
      const newStartZ = Math.max(0, Math.min(GRID_SIZE - 1,
        Math.round((rz / TERRAIN_SCALE + 0.5) * GRID_SIZE),
      ));

      // Stop animation and update start waypoint synchronously.
      sim.setStatus('rerouting');
      sim.setWaypoint('start', { x: newStartX, z: newStartZ });

      // Delay the API call slightly so:
      //   1. React flushes the setWaypoint update into the store
      //   2. latestRef in useRouteCalculation picks up the new waypoints
      //   3. The HUD "Rerouting" banner has time to appear visually
      setTimeout(async () => {
        try {
          await calculateRef.current({ returnVisited: true });
        } finally {
          pendingRef.current = false;
        }
      }, 120); // short: just enough for one React render cycle (~16ms) + margin
    });

    return unsubscribe;
  // Empty deps: the subscription is set up once and reads everything imperatively.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
