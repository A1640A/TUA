import { createNoise2D } from 'simplex-noise';
import type { TerrainData, TerrainConfig, CraterDefinition } from '@/types/terrain.types';

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateTerrain(config: TerrainConfig): TerrainData {
  const { gridSize, craterCount, seed } = config;
  const size = gridSize * gridSize;
  const rng = seededRandom(seed);
  const noise2D = createNoise2D(rng);

  const heightMap = new Float32Array(size);
  const craterMap = new Float32Array(size);

  //  Simplex noise heightmap (multi-octave) 
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const nx = x / gridSize;
      const nz = z / gridSize;
      const h =
        0.60 * noise2D(nx * 2,   nz * 2) +
        0.25 * noise2D(nx * 5,   nz * 5) +
        0.10 * noise2D(nx * 12,  nz * 12) +
        0.05 * noise2D(nx * 25,  nz * 25);
      heightMap[z * gridSize + x] = (h + 1) / 2; // normalize 0-1
    }
  }

  //  Craters 
  const craters: CraterDefinition[] = [];
  for (let i = 0; i < craterCount; i++) {
    const cx = Math.floor(rng() * gridSize);
    const cz = Math.floor(rng() * gridSize);
    const radius = 3 + Math.floor(rng() * 8);
    const depth  = 0.2 + rng() * 0.35;
    craters.push({ cx, cz, radius, depth });

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const px = cx + dx;
        const pz = cz + dz;
        if (px < 0 || px >= gridSize || pz < 0 || pz >= gridSize) continue;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > radius) continue;
        const idx = pz * gridSize + px;
        const rim = dist / radius;
        const bowl = Math.cos((rim * Math.PI) / 2);
        heightMap[idx] -= depth * bowl;
        heightMap[idx] = Math.max(0, heightMap[idx]);
        // Crater rim risk
        craterMap[idx] = Math.max(craterMap[idx], 1 - rim);
      }
    }
  }

  //  Slope map 
  const slopeMap = new Float32Array(size);
  for (let z = 1; z < gridSize - 1; z++) {
    for (let x = 1; x < gridSize - 1; x++) {
      const idx = z * gridSize + x;
      const dx = heightMap[z * gridSize + (x + 1)] - heightMap[z * gridSize + (x - 1)];
      const dz = heightMap[(z + 1) * gridSize + x] - heightMap[(z - 1) * gridSize + x];
      slopeMap[idx] = Math.sqrt(dx * dx + dz * dz) / 2;
    }
  }

  return { heightMap, craterMap, slopeMap, config };
}
