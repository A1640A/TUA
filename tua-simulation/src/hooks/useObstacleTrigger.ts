'use client';
import { useEffect, useRef } from 'react';
import { useObstacleStore } from '@/store/obstacleStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useRouteCalculation } from './useRouteCalculation';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';

/**
 * Watches the obstacle list and triggers a dynamic reroute when a new obstacle
 * is added while the rover is actively navigating.
 *
 * KEY DESIGN: Uses Zustand's `getState()` for all reads of frequently-changing
 * values (status, roverState.position) to completely avoid stale closures:
 *   - `status` is read imperatively at trigger time, not from a React render snapshot.
 *   - `roverState.position` is read imperatively without subscribing to it
 *     (subscribing would cause a re-render every animation frame).
 *
 * Must be called OUTSIDE the R3F <Canvas> (SimulationPage level) so it runs in
 * the standard React tree where Zustand subscriptions are not throttled by the
 * WebGL render loop.
 */
export function useObstacleTrigger() {
  // Only subscribe to obstacle count — this is the sole trigger.
  const obstacleCount = useObstacleStore(s => s.obstacles.length);
  const prevCountRef  = useRef(0);
  const pendingRef    = useRef(false);

  // calculate must be stable enough to be a dependency — it changes when
  // obstacles changes (its useCallback dep), which is exactly when we need it.
  const { calculate } = useRouteCalculation();

  useEffect(() => {
    // Obstacle was REMOVED or count unchanged — skip.
    if (obstacleCount <= prevCountRef.current) {
      prevCountRef.current = obstacleCount;
      return;
    }
    prevCountRef.current = obstacleCount;

    // -- Imperative reads to avoid stale closures --
    // Zustand getState() always returns the current store snapshot,
    // regardless of React's render cycle.
    const simState = useSimulationStore.getState();

    // Only reroute while the rover is actively driving.
    if (simState.status !== 'animating') return;

    // Prevent concurrent reroutes if the user drops multiple obstacles quickly.
    if (pendingRef.current) return;
    pendingRef.current = true;

    // Convert world-space rover position to grid cell (imperative, no stale closure).
    const [rx, , rz] = simState.roverState.position;
    const clampedX = Math.max(0, Math.min(GRID_SIZE - 1,
      Math.round((rx / TERRAIN_SCALE + 0.5) * GRID_SIZE),
    ));
    const clampedZ = Math.max(0, Math.min(GRID_SIZE - 1,
      Math.round((rz / TERRAIN_SCALE + 0.5) * GRID_SIZE),
    ));

    // Signal the HUD and stop the animation loop.
    simState.setStatus('rerouting');
    // Move start waypoint to rover's current position.
    simState.setWaypoint('start', { x: clampedX, z: clampedZ });

    // Short pause — shows the "Rerouting" HUD banner before the API fires,
    // giving judges a visible "thinking" moment.
    const timer = setTimeout(async () => {
      try {
        await calculate({ returnVisited: true });
      } finally {
        pendingRef.current = false;
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      pendingRef.current = false;
    };
  // calculate is stable (empty useCallback deps in useRouteCalculation),
  // so this effect only fires when obstacleCount actually changes.
  }, [obstacleCount, calculate]);
}
