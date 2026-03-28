'use client';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { useRouteCalculation } from './useRouteCalculation';
import type { GridNode } from '@/types/simulation.types';

export function useSimulation() {
  const store = useSimulationStore();
  const terrainStore = useTerrainStore();
  const { calculate } = useRouteCalculation();

  const setStart = (grid: GridNode) => store.setWaypoint('start', grid);
  const setEnd   = (grid: GridNode) => store.setWaypoint('end',   grid);

  const startSimulation = async () => {
    store.reset();
    await calculate();
  };

  const regenerateTerrain = () => {
    store.reset();
    terrainStore.updateConfig({ seed: Math.floor(Math.random() * 99999) });
  };

  return {
    status:      store.status,
    waypoints:   store.waypoints,
    routeResult: store.routeResult,
    roverState:  store.roverState,
    costWeights: store.costWeights,
    error:       store.error,
    terrain:     terrainStore.terrain,
    terrainConfig: terrainStore.config,
    setStart,
    setEnd,
    startSimulation,
    regenerateTerrain,
    setCostWeights: store.setCostWeights,
    reset: store.reset,
  };
}
