export interface TerrainConfig {
  gridSize: number;
  scale: number;
  heightScale: number;
  craterCount: number;
  seed: number;
}

export interface TerrainData {
  heightMap: Float32Array;    // gridSize * gridSize
  craterMap: Float32Array;    // 0-1 proximity values
  slopeMap:  Float32Array;    // pre-computed slopes
  config: TerrainConfig;
}

export interface CraterDefinition {
  cx: number;
  cz: number;
  radius: number;
  depth: number;
}
