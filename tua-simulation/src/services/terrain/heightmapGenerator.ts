import { createNoise2D } from 'simplex-noise';
import type { TerrainData, TerrainConfig, CraterDefinition } from '@/types/terrain.types';

/**
 * Seeded Park-Miller LCG — period 2³¹-2, passes BigCrush.
 * Used instead of Math.random() for full determinism.
 */
function seededRng(seed: number) {
  let s = seed | 0;
  if (s === 0) s = 1;
  return (): number => {
    s = Math.imul(16807, s) | 0;
    if (s < 0) s += 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Fractional Brownian Motion (fBm) heightmap generator.
 *
 * Mathematical model — lunar surface is a self-affine fractal:
 *   H(x,z) = ∑ₖ aₖ · N(x · fₖ, z · fₖ)
 *
 * Octave amplitudes follow a power law: aₖ = a₀ · f₀ˢ / fₖˢ
 * where s = 1 + H (Hurst exponent H ≈ 0.75 for highland regolith).
 * This gives a realistic 1/f^β power spectrum (β ≈ 2.5).
 *
 * Crater morphology follows Pike (1974, 1977) empirical scaling:
 *   Simple craters (D < ~15 km terrestrial scale):
 *     depth   d  = k_d · D^{α_d}   (α_d ≈ 1.010, k_d ≈ 0.196)
 *     rim ht  h  = k_h · D^{α_h}   (α_h ≈ 1.014, k_h ≈ 0.036)
 *   Ejecta blanket thickness ∝ r^{-3} beyond the rim (McGetchin 1973).
 *
 * We normalise to grid-cell units and apply a globally consistent scale factor
 * so the visual result matches the TERRAIN_HEIGHT_SCALE used in MoonTerrain.tsx.
 */

// ── fBm parameters ────────────────────────────────────────────────────────────
// Octave table: [frequency_multiplier, amplitude_weight]
// Amplitudes are pre-normalised so they sum to 1.0.
const OCTAVES: [number, number][] = [
  [1.80, 0.520],   // continental rolls (low freq)
  [3.80, 0.240],   // regional undulations
  [8.20, 0.120],   // major ridges & basins
  [17.5, 0.076],   // small hills & regolith mounds
  [38.0, 0.044],   // pebble-scale surface roughness
];

// ── Crater scaling constants (Pike 1977, normalised) ─────────────────────────
// For grid radius R (cells), the Pike depth in normalised [0,1] height units:
//   depth_norm = PIKE_K × (2R / gridSize)^PIKE_A
// Values tuned so D≈20 cells → depth≈0.28, D≈5 cells → depth≈0.12
const PIKE_K  = 0.95;   // amplitude constant
const PIKE_A  = 0.92;   // scaling exponent (≈ Pike α_d)
const PIKE_KH = 0.20;   // rim height fraction of depth (Pike k_h / k_d ≈ 0.184)

// Ejecta power-law exponent (McGetchin 1973: T ∝ r^-3.0)
const EJECTA_EXPONENT = 3.0;
const EJECTA_REACH    = 1.90; // how many crater radii the blanket extends to

export function generateTerrain(config: TerrainConfig): TerrainData {
  const { gridSize, craterCount, seed } = config;
  const N   = gridSize;
  const sz  = N * N;
  const rng = seededRng(seed);

  // Noise function seeded from the same RNG
  const noise2D = createNoise2D(rng);

  const heightMap = new Float32Array(sz);
  const craterMap = new Float32Array(sz);

  // ── 1. fBm base terrain ────────────────────────────────────────────────────
  let ampSum = 0;
  for (const [, a] of OCTAVES) ampSum += a;

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const nx = x / N;
      const nz = z / N;
      let h = 0;
      for (const [f, a] of OCTAVES) {
        h += a * noise2D(nx * f, nz * f);
      }
      // Normalise: noise output ∈ [-ampSum, +ampSum] → [0, 1]
      heightMap[z * N + x] = (h / ampSum + 1) * 0.5;
    }
  }

  // ── 2. Crater stamping with Pike (1977) morphology ────────────────────────
  const craters: CraterDefinition[] = [];

  // Size distribution: N(R) ∝ R^{-2}  (Neukum production function slope)
  // We draw radius from an inverse-CDF of that power law over [r_min, r_max].
  // CDF:  F(R) = (R^{-1} - r_max^{-1}) / (r_min^{-1} - r_max^{-1})
  // Inverse: R(u) = 1 / (u·(r_min^{-1} - r_max^{-1}) + r_max^{-1})
  const R_MIN = 5;          // minimum crater radius in grid cells
  const R_MAX = 22;         // maximum crater radius in grid cells
  const invMin = 1 / R_MIN;
  const invMax = 1 / R_MAX;

  for (let i = 0; i < craterCount; i++) {
    const cx = Math.floor(rng() * N);
    const cz = Math.floor(rng() * N);

    // Inverse-power-law sample — gives realistic size distribution
    const u      = rng();
    const radius = Math.round(1 / (u * (invMin - invMax) + invMax));
    const R      = Math.max(R_MIN, Math.min(R_MAX, radius));

    // Pike (1977) depth and rim height
    const normDiam = (2 * R) / N;          // normalised diameter ∈ [0,1]
    const depth    = PIKE_K * Math.pow(normDiam, PIKE_A);
    const rimH     = depth * PIKE_KH;

    craters.push({ cx, cz, radius: R, depth });

    // Scan region: interior + rim + ejecta blanket
    const scanR = Math.ceil(R * EJECTA_REACH);

    for (let dz = -scanR; dz <= scanR; dz++) {
      for (let dx = -scanR; dx <= scanR; dx++) {
        const px = cx + dx;
        const pz = cz + dz;
        if (px < 0 || px >= N || pz < 0 || pz >= N) continue;

        const dist = Math.sqrt(dx * dx + dz * dz);
        const r    = dist / R;   // r=0 → centre, r=1 → rim, r>1 → ejecta
        const idx  = pz * N + px;

        if (r <= 1.0) {
          // ── Interior bowl: smooth paraboloid (simple crater profile) ─────
          //   z(r) = -d × (1 - r²)   with centre deepest
          const bowl = 1.0 - r * r;
          heightMap[idx] = Math.max(0, heightMap[idx] - depth * bowl);

          // Risk map: inversely proportional to bowl depth
          craterMap[idx] = Math.max(craterMap[idx], bowl);
        }

        // ── Rim: narrow Gaussian centred at r = 1.0 ───────────────────────
        //   h_rim(r) = rimH × exp( -(r-1)² / (2·σ²) )   σ = 0.10
        if (r > 0.70 && r <= 1.45) {
          const sigma    = 0.10;
          const rimShape = Math.exp(-((r - 1.0) ** 2) / (2 * sigma * sigma));
          heightMap[idx] = Math.min(1, heightMap[idx] + rimH * rimShape);
        }

        // ── Ejecta blanket: McGetchin (1973) power-law falloff ────────────
        //   T(r) = T₀ × (R/dist)^3   for r > 1.15
        //   T₀ = rimH × 0.12 (thickness at rim edge)
        if (r > 1.15 && r <= EJECTA_REACH) {
          // Power-law thinning
          const T0      = rimH * 0.12;
          const Tdist   = T0 * Math.pow(1.15 / r, EJECTA_EXPONENT);
          // Modulate with high-frequency noise for ragged ejecta texture
          const ex      = (px / N) * 55;
          const ez      = (pz / N) * 55;
          const noiseM  = 0.5 + 0.5 * noise2D(ex, ez);
          heightMap[idx] = Math.min(1, heightMap[idx] + Tdist * noiseM);
        }
      }
    }
  }

  // ── 3. Regolith smoothing pass ─────────────────────────────────────────────
  // Apply a single 3×3 box-blur pass to the non-crater regions to simulate
  // micro-scale regolith homogenisation (gardening by small impactors).
  // This preserves sharp crater rims while softening open plains.
  const smoothed = new Float32Array(heightMap);
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const idx = z * N + x;
      if (craterMap[idx] > 0.15) continue; // skip inside craters
      let sum = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          sum += heightMap[(z + dz) * N + (x + dx)];
        }
      }
      smoothed[idx] = sum / 9;
    }
  }
  smoothed.forEach((v, i) => { heightMap[i] = v; });

  // ── 4. Slope map — central differences, physically normalised ─────────────
  // Slope = |∇H| expressed as a rise/run ratio per grid-cell width.
  // Clamped to [0, 1] for downstream A* penalisation.
  const slopeMap = new Float32Array(sz);
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const i  = z * N + x;
      const dX = (heightMap[z * N + x + 1] - heightMap[z * N + x - 1]) * 0.5;
      const dZ = (heightMap[(z + 1) * N + x] - heightMap[(z - 1) * N + x]) * 0.5;
      // Magnitude of gradient; divide by 2 so unit-ramp = 0.5 (matches old scale)
      slopeMap[i] = Math.min(1, Math.sqrt(dX * dX + dZ * dZ));
    }
  }

  return { heightMap, craterMap, slopeMap, config };
}
