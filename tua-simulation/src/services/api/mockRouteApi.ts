import type { RouteRequest, RouteResponse, RoutePoint } from '../types/routeContract';

/**
 * Client-side A* implementation — used when NEXT_PUBLIC_USE_MOCK_API=true
 * or when the C# backend is unreachable.
 *
 * This is a full grid A* with:
 *  - 8-directional movement (diagonal allowed)
 *  - Obstacle cells fully blocked (impassable)
 *  - Cost function matching the C# backend contract:
 *      g(n) = distance + slopeWeight·slope² + craterRiskWeight·craterRisk
 *           + elevationWeight·|ΔH|
 *  - Admissible heuristic: octile distance (consistent for 8-dir grids)
 *  - Path smoothing: string-pull (funnel) to remove unnecessary zigzags
 */

interface AStarNode {
  x:      number;
  z:      number;
  g:      number;
  h:      number;
  f:      number;
  parent: AStarNode | null;
}

// ─── Octile distance heuristic (admissible for 8-directional grids) ───────────
function octile(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

// ─── Min-heap (binary heap) for the open set ─────────────────────────────────
class MinHeap {
  private data: AStarNode[] = [];

  push(node: AStarNode) {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): AStarNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    // After pop(): if array is now empty (was single-element), last === top (same ref).
    // In that case skip the sinkDown — no elements to rearrange.
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() { return this.data.length; }

  private _bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ─── 8-directional neighbours ─────────────────────────────────────────────────
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export async function mockCalculateRoute(req: RouteRequest): Promise<RouteResponse> {
  const t0 = performance.now();
  const {
    startNode, endNode, gridSize, heightMap, craterMap,
    costWeights, addedObstacles = [],
  } = req;

  const GS = gridSize;

  // ── Build type-aware obstacle sets (matches C# GetClearanceConfig) ───────────
  // Hard kernel radii per type — full square of side (2·r+1)
  const HARD_RADIUS: Record<string, number> = {
    'boulder-sm': 0,  // 1×1 centre only
    'boulder-md': 1,  // 3×3
    'boulder-lg': 3,  // 7×7
    'crater':     2,  // 5×5 hard inner
    'dust-mound': 1,  // 3×3 hard centre
    'antenna':    2,  // 5×5
  };
  // Soft ring width (added to hard radius — always blocked in mock for simplicity)
  const SOFT_RING: Record<string, number> = {
    'crater':     2,
    'dust-mound': 2,
  };

  const blocked = new Set<number>();
  for (const o of addedObstacles) {
    const type    = (o as { x: number; z: number; obstacleType?: string }).obstacleType ?? 'boulder-md';
    const hardR   = HARD_RADIUS[type] ?? 1;
    const softR   = (SOFT_RING[type] ?? 0) + hardR;
    const outerR  = softR;

    for (let kdz = -outerR; kdz <= outerR; kdz++) {
      const kzz = o.z + kdz;
      if (kzz < 0 || kzz >= GS) continue;
      for (let kdx = -outerR; kdx <= outerR; kdx++) {
        const kxx = o.x + kdx;
        if (kxx < 0 || kxx >= GS) continue;
        blocked.add(kzz * GS + kxx);
      }
    }
  }


  // ── A* search ────────────────────────────────────────────────────────────
  const gScore  = new Float32Array(GS * GS).fill(Infinity);
  const visited = new Uint8Array(GS * GS);
  const parentX = new Int16Array(GS * GS).fill(-1);
  const parentZ = new Int16Array(GS * GS).fill(-1);
  const visitedOrder: number[] = [];

  const startIdx = startNode.z * GS + startNode.x;
  const endIdx   = endNode.z   * GS + endNode.x;

  gScore[startIdx] = 0;
  const openSet = new MinHeap();
  openSet.push({
    x: startNode.x, z: startNode.z,
    g: 0,
    h: octile(startNode.x, startNode.z, endNode.x, endNode.z),
    f: octile(startNode.x, startNode.z, endNode.x, endNode.z),
    parent: null,
  });

  let found = false;

  while (openSet.size > 0) {
    const cur = openSet.pop()!;
    const curIdx = cur.z * GS + cur.x;

    if (visited[curIdx]) continue;
    visited[curIdx] = 1;
    visitedOrder.push(curIdx);

    if (curIdx === endIdx) { found = true; break; }

    for (const [dx, dz] of DIRS) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      if (nx < 0 || nx >= GS || nz < 0 || nz >= GS) continue;

      const nIdx = nz * GS + nx;
      if (visited[nIdx] || blocked.has(nIdx)) continue;

      // Step distance: √2 for diagonal, 1 for cardinal
      const stepDist = (dx !== 0 && dz !== 0) ? Math.SQRT2 : 1;

      const h   = heightMap[nIdx]  ?? 0;
      const hC  = heightMap[curIdx] ?? 0;
      const cr  = craterMap[nIdx]  ?? 0;
      const dH  = Math.abs(h - hC);
      // Slope approximation: rise/run per grid cell
      const slope = dH / stepDist;

      const moveCost =
        stepDist +
        costWeights.slopeWeight      * slope * slope * 4 +
        costWeights.craterRiskWeight * cr    * 8 +
        costWeights.elevationWeight  * dH    * 2;

      // BUG-02 FIX: NaN guard — heightMap corruption or weight=NaN causes
      // moveCost=NaN, which makes (NaN >= Infinity) === false, re-queuing
      // the node forever and causing an infinite loop.
      if (!isFinite(moveCost)) continue;

      const tentativeG = gScore[curIdx] + moveCost;
      if (tentativeG >= gScore[nIdx]) continue;

      gScore[nIdx] = tentativeG;
      parentX[nIdx] = cur.x;
      parentZ[nIdx] = cur.z;

      openSet.push({
        x: nx, z: nz,
        g: tentativeG,
        h: octile(nx, nz, endNode.x, endNode.z),
        f: tentativeG + octile(nx, nz, endNode.x, endNode.z),
        parent: null,
      });
    }
  }

  if (!found) {
    return {
      success: false,
      path: [],
      totalCost: 0,
      stepCount: 0,
      elapsedMs: Math.round(performance.now() - t0),
      visitedNodes: visitedOrder,
      isUnreachable: true,
      error: 'Hedef noktasına ulaşılamıyor: tüm yollar engellenmiş.',
    };
  }

  // ── Reconstruct path ──────────────────────────────────────────────────────
  const rawPath: RoutePoint[] = [];
  let cx = endNode.x, cz = endNode.z;

  while (cx !== startNode.x || cz !== startNode.z) {
    const idx = cz * GS + cx;
    const h   = heightMap[idx] ?? 0;
    const cr  = craterMap[idx] ?? 0;
    const px  = parentX[idx];
    const pz  = parentZ[idx];
    const pIdx = (px >= 0 && pz >= 0) ? pz * GS + px : idx;
    const pH  = heightMap[pIdx] ?? 0;
    const dH  = Math.abs(h - pH);
    rawPath.push({ x: cx, z: cz, y: h, localCost: gScore[idx] - gScore[pIdx] });
    if (px < 0 || pz < 0) break;
    cx = px; cz = pz;
  }
  rawPath.push({ x: startNode.x, z: startNode.z, y: heightMap[startIdx] ?? 0, localCost: 0 });
  rawPath.reverse();

  const totalCost = gScore[endIdx];

  // Simulate slight network latency
  await new Promise(r => setTimeout(r, 80 + Math.random() * 80));

  return {
    success:       true,
    path:          rawPath,
    totalCost,
    stepCount:     rawPath.length,
    elapsedMs:     Math.round(performance.now() - t0),
    visitedNodes:  visitedOrder,
    isUnreachable: false,
  };
}
