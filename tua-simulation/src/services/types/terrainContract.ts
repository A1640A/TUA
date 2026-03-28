import type { CostWeights } from './routeContract';

export interface TerrainSerializedPayload {
  gridSize:  number;
  heightMap: number[];
  craterMap: number[];
  weights:   CostWeights;
}
