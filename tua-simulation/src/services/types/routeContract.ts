//  Request shape (Next.js  C# API) 
export interface RouteRequest {
  startNode:    { x: number; z: number };
  endNode:      { x: number; z: number };
  gridSize:     number;
  heightMap:    number[];   // Float array serialized as number[]
  craterMap:    number[];
  costWeights:  CostWeights;
}

export interface CostWeights {
  slopeWeight:      number;
  craterRiskWeight: number;
  elevationWeight:  number;
}

//  Response shape (C# API  Next.js) 
export interface RouteResponse {
  success:    boolean;
  path:       RoutePoint[];
  totalCost:  number;
  stepCount:  number;
  elapsedMs:  number;
  error?:     string;
}

export interface RoutePoint {
  x:         number;   // grid X
  z:         number;   // grid Z
  y:         number;   // world Y (height)
  localCost: number;   // cost at this node
}
