import type { TerrainData } from '@/types/terrain.types';
import type { CostWeights, RouteRequest } from '../types/routeContract';
import type { GridNode, Obstacle } from '@/types/simulation.types';
import { ROVER_FOOTPRINT } from '@/lib/constants';

/**
 * Serialises internal TerrainData + runtime state into the JSON payload
 * the C# route API expects.
 *
 * The C# A* engine now owns all obstacle footprint expansion logic.
 * Each obstacle is sent as a single grid cell with its `obstacleType`
 * string so the backend can apply the correct per-type clearance kernel:
 *
 * | Type         | C# hard kernel | C# soft rim |
 * |--------------|---------------|-------------|
 * | boulder-sm   | 1×1           | none        |
 * | boulder-md   | 3×3           | none        |
 * | boulder-lg   | 7×7           | none        |
 * | crater       | 5×5           | 2-cell slope-gated |
 * | dust-mound   | 3×3           | 2-cell slope-gated |
 * | antenna      | 5×5           | none        |
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
  const gs = terrain.config.gridSize;

  // Deduplicate by grid cell so two obstacles at the same position don't
  // double-send. C# handles all spatial expansion — we send one entry per
  // logical obstacle with its type.
  const seen = new Set<string>();
  const uniqueObstacles = obstacles
    .filter(o => {
      const key = `${o.grid.x},${o.grid.z}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(o => ({
      x:            o.grid.x,
      z:            o.grid.z,
      obstacleType: o.variant,    // maps 1:1 to ObstacleNode.ObstacleType in C#
    }));

  return {
    startNode:      { x: start.x, z: start.z },
    endNode:        { x: end.x,   z: end.z   },
    gridSize:       gs,
    heightMap:      Array.from(terrain.heightMap),
    craterMap:      Array.from(terrain.craterMap),
    costWeights,
    addedObstacles: uniqueObstacles,
    returnVisited,
    roverFootprint: ROVER_FOOTPRINT,  // mirrors C# AStarAlgorithm.RoverClearanceRadius
  };
}
