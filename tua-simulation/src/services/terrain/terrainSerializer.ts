import type { TerrainData } from '@/types/terrain.types';
import type { CostWeights, RouteRequest } from '../types/routeContract';
import type { GridNode, Obstacle } from '@/types/simulation.types';

/**
 * Serialises internal TerrainData + runtime state into the JSON payload
 * the C# route API expects.
 *
 * @param terrain       - Current terrain data (heightMap, craterMap).
 * @param start         - Start waypoint grid cell.
 * @param end           - End waypoint grid cell.
 * @param costWeights   - A* weighting parameters.
 * @param obstacles     - Dynamically placed obstacles to treat as impassable.
 * @param returnVisited - When true, the API will return the A* visited-node list
 *                        for the real-time scan-animation overlay.
 */
export function buildRouteRequest(
  terrain:       TerrainData,
  start:         GridNode,
  end:           GridNode,
  costWeights:   CostWeights,
  obstacles:     Obstacle[] = [],
  returnVisited: boolean    = false,
): RouteRequest {
  return {
    startNode:      { x: start.x, z: start.z },
    endNode:        { x: end.x,   z: end.z   },
    gridSize:       terrain.config.gridSize,
    heightMap:      Array.from(terrain.heightMap),
    craterMap:      Array.from(terrain.craterMap),
    costWeights,
    addedObstacles: obstacles.map(o => ({ x: o.grid.x, z: o.grid.z })),
    returnVisited,
  };
}
