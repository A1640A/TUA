import type { TerrainData } from '@/types/terrain.types';
import type { CostWeights, RouteRequest } from '../types/routeContract';
import type { GridNode, Obstacle } from '@/types/simulation.types';

/**
 * Converts a single obstacle grid cell into a cross-shaped blocker pattern
 * that covers the boulder's visual footprint.
 *
 * WHY THIS IS NECESSARY:
 * A* uses 8-directional (diagonal) movement. If only the exact center cell
 * is marked as impassable, the rover can slip BETWEEN adjacent cells diagonally
 * without ever entering the blocked cell — visually passing "through" the boulder.
 *
 * The cross pattern (+) blocks the center AND its 4 cardinal neighbors, forcing
 * A* to route at least 2 cells away from the boulder center in any direction.
 *
 * For lg-boulders/craters a diamond pattern (radius 2) is applied.
 */
function expandObstacle(
  grid:      GridNode,
  variant:   Obstacle['variant'],
  gridSize:  number,
): { x: number; z: number }[] {
  // lg boulders and craters need a wider 2-cell diamond to ensure even
  // diagonal movement can't clip through their wide visual footprints.
  // All other variants use a 1-cell diamond (5 cells total).
  const radius = (variant === 'boulder-lg' || variant === 'crater') ? 2 : 1;
  const cells: { x: number; z: number }[] = [];

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Diamond (Manhattan) shape — not full square.
      if (Math.abs(dx) + Math.abs(dz) > radius) continue;
      const nx = grid.x + dx;
      const nz = grid.z + dz;
      if (nx >= 0 && nx < gridSize && nz >= 0 && nz < gridSize) {
        cells.push({ x: nx, z: nz });
      }
    }
  }
  return cells;
}

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
  const gs = terrain.config.gridSize;

  // Expand each boulder to a multi-cell blocker pattern to prevent
  // the A* from slipping diagonally past the visual footprint of the rock.
  const expandedObstacles = obstacles.flatMap(o =>
    expandObstacle(o.grid, o.variant, gs),
  );

  // Deduplicate in case two obstacles overlap after expansion.
  const seen = new Set<string>();
  const uniqueObstacles = expandedObstacles.filter(c => {
    const key = `${c.x},${c.z}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    startNode:      { x: start.x, z: start.z },
    endNode:        { x: end.x,   z: end.z   },
    gridSize:       gs,
    heightMap:      Array.from(terrain.heightMap),
    craterMap:      Array.from(terrain.craterMap),
    costWeights,
    addedObstacles: uniqueObstacles,
    returnVisited,
  };
}
