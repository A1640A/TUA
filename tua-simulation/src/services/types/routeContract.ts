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
   * Each obstacle carries its type so the C# engine applies the correct
   * per-type clearance kernel (rigid square vs slope-gated rim).
   */
  addedObstacles: { x: number; z: number; obstacleType: string }[];
  /**
   * When true, the response `visitedNodes` array will be populated with the
   * sequence of grid-cell IDs expanded by A*, enabling the scan-animation overlay.
   */
  returnVisited:  boolean;
  /**
   * Rover clearance half-side in grid cells for True Clearance A* (C-Space expansion).
   * Must mirror the ROVER_CLEARANCE_RADIUS constant and AStarAlgorithm.RoverClearanceRadius.
   * 0 = point-mass (no clearance), 1 = 3×3 kernel (default), 2 = 5×5, 3 = 7×7.
   */
  roverFootprint: number;
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
