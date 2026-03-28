// ─── Request ──────────────────────────────────────────────────────────────────

/** Sent to POST /api/route/calculate. Must mirror TuaApi.Models.Request.RouteRequest. */
export interface RouteRequest {
  startNode:      { x: number; z: number };
  endNode:        { x: number; z: number };
  gridSize:       number;
  /** Row-major height values, length = gridSize². */
  heightMap:      number[];
  /** Row-major crater-risk values [0, 1], length = gridSize². */
  craterMap:      number[];
  costWeights:    CostWeights;
  /**
   * Dynamically placed obstacles — each entry makes its grid cell impassable.
   * Send on every reroute call so the C# engine can rebuild the obstacle set.
   */
  addedObstacles: { x: number; z: number }[];
  /**
   * When true, the response `visitedNodes` array will be populated with the
   * sequence of grid-cell IDs expanded by A*, enabling the scan-animation overlay.
   */
  returnVisited:  boolean;
}

export interface CostWeights {
  slopeWeight:      number;
  craterRiskWeight: number;
  elevationWeight:  number;
}

// ─── Response ─────────────────────────────────────────────────────────────────

/** Received from POST /api/route/calculate. Mirrors TuaApi.Models.Response.RouteResponse. */
export interface RouteResponse {
  success:       boolean;
  path:          RoutePoint[];
  totalCost:     number;
  stepCount:     number;
  elapsedMs:     number;
  error?:        string;
  /**
   * Ordered list of flat grid IDs (z * gridSize + x) that A* expanded.
   * Only present when `returnVisited = true` was sent in the request.
   */
  visitedNodes:  number[];
  /** True when the target cell was completely surrounded by obstacles. */
  isUnreachable: boolean;
}

export interface RoutePoint {
  x:         number; // grid X
  z:         number; // grid Z
  y:         number; // world Y (normalised height)
  localCost: number; // accumulated A* cost at this node
}
