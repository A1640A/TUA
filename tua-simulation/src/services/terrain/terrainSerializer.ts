import type { TerrainData } from '@/types/terrain.types';
import type { CostWeights, RouteRequest } from '../types/routeContract';
import type { GridNode } from '@/types/simulation.types';

/** Converts internal TerrainData into the JSON payload the C# API expects */
export function buildRouteRequest(
  terrain: TerrainData,
  start: GridNode,
  end: GridNode,
  costWeights: CostWeights
): RouteRequest {
  return {
    startNode:   { x: start.x, z: start.z },
    endNode:     { x: end.x,   z: end.z },
    gridSize:    terrain.config.gridSize,
    heightMap:   Array.from(terrain.heightMap),
    craterMap:   Array.from(terrain.craterMap),
    costWeights,
  };
}
