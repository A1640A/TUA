'use client';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { useRouteCalculation } from './useRouteCalculation';
import type { GridNode } from '@/types/simulation.types';

/**
 * Facade hook that orchestrates the full simulation lifecycle.
 *
 * Consumers (ControlPanel, etc.) call this single hook instead of
 * reaching into multiple stores directly — keeping component code thin
 * and the store coupling in one place.
 *
 * @returns Stable action functions and derived state slices.
 */
export function useSimulation() {
  const store        = useSimulationStore();
  const terrainStore = useTerrainStore();
  const obstacleStore = useObstacleStore();
  const { calculate } = useRouteCalculation();

  const setStart = (grid: GridNode) => store.setWaypoint('start', grid);
  const setEnd   = (grid: GridNode) => store.setWaypoint('end',   grid);

  /**
   * Full initial route calculation.
   * Resets animation state, then fires the API (no visitedNodes requested
   * for the first run to keep latency minimal).
   */
  const startSimulation = async () => {
    store.reset();
    await calculate({ returnVisited: false });
  };

  /**
   * Mid-drive reroute triggered when an obstacle is placed while the rover
   * is actively navigating. Preserves the current rover position as the new
   * start point and requests visitedNodes for the scan animation.
   */
  const rerouteFromCurrent = async () => {
    if (store.status !== 'animating' && store.status !== 'completed') return;
    store.setStatus('rerouting');

    // Update the start waypoint to the rover's current grid position
    // (approximate from world position using terrain constants).
    const [rx, , rz] = store.roverState.position;
    const TERRAIN_SCALE = 50;
    const gx = Math.round((rx / TERRAIN_SCALE + 0.5) * 128);
    const gz = Math.round((rz / TERRAIN_SCALE + 0.5) * 128);
    store.setWaypoint('start', {
      x: Math.max(0, Math.min(127, gx)),
      z: Math.max(0, Math.min(127, gz)),
    });

    await calculate({ returnVisited: true });
  };

  const regenerateTerrain = () => {
    store.reset();
    obstacleStore.clearObstacles();
    terrainStore.updateConfig({ seed: Math.floor(Math.random() * 99999) });
  };

  return {
    status:        store.status,
    waypoints:     store.waypoints,
    routeResult:   store.routeResult,
    roverState:    store.roverState,
    costWeights:   store.costWeights,
    error:         store.error,
    terrain:       terrainStore.terrain,
    terrainConfig: terrainStore.config,
    obstacles:     obstacleStore.obstacles,
    setStart,
    setEnd,
    startSimulation,
    rerouteFromCurrent,
    regenerateTerrain,
    setCostWeights: store.setCostWeights,
    reset: store.reset,
  };
}
