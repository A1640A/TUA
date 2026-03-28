import type { RouteRequest, RouteResponse, RoutePoint } from '../types/routeContract';
import { euclideanDistance } from '@/lib/mathUtils';

/**
 * Client-side mock A*  used when NEXT_PUBLIC_USE_MOCK_API=true
 * Produces a realistic diagonal path with height sampling.
 */
export async function mockCalculateRoute(req: RouteRequest): Promise<RouteResponse> {
  const t0 = performance.now();

  const { startNode, endNode, gridSize, heightMap, craterMap, costWeights } = req;

  // Simple Bresenham-style line with cost
  const path: RoutePoint[] = [];
  let totalCost = 0;
  let x = startNode.x;
  let z = startNode.z;

  const dx = endNode.x - startNode.x;
  const dz = endNode.z - startNode.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const nx = Math.round(startNode.x + dx * t);
    const nz = Math.round(startNode.z + dz * t);
    const idx = nz * gridSize + nx;

    const height     = heightMap[idx]  ?? 0;
    const craterRisk = craterMap[idx]  ?? 0;
    const prevIdx    = path.length > 0 ? (path[path.length - 1].z * gridSize + path[path.length - 1].x) : idx;
    const elevDelta  = Math.abs(height - (heightMap[prevIdx] ?? 0));
    const dist       = euclideanDistance(x, z, nx, nz);
    const slope      = dist > 0 ? elevDelta / dist : 0;

    const localCost =
      dist +
      costWeights.elevationWeight  * elevDelta +
      costWeights.slopeWeight      * slope * slope +
      costWeights.craterRiskWeight * craterRisk * 10;

    path.push({ x: nx, z: nz, y: height, localCost });
    totalCost += localCost;
    x = nx; z = nz;
  }

  // Simulate network delay
  await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

  return {
    success:       true,
    path,
    totalCost,
    stepCount:     path.length,
    elapsedMs:     Math.round(performance.now() - t0),
    visitedNodes:  [],
    isUnreachable: false,
  };
}
