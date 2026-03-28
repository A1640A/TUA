import { create } from 'zustand';
import type { TerrainData, TerrainConfig } from '@/types/terrain.types';
import type { GridNode, Obstacle } from '@/types/simulation.types';
import {
  GRID_SIZE, TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, CRATER_COUNT,
} from '@/lib/constants';

// ─── Terrain deformation constants ──────────────────────────────────────────────
// All radii are in grid cells. At GRID_SIZE=128 / TERRAIN_SCALE=80, 1 cell ≈ 0.625wu.

/** Crater: inner bowl radius (cells). Produces deep parabolic depression. */
const CRATER_INNER_R   = 6;
/** Crater: outer rim radius (cells). Total 12-cell diameter ≈ 7.5wu ≈ large impact zone. */
const CRATER_OUTER_R   = 11;
/** Crater: maximum bowl depression in normalised heightMap units [0–1]. */
const CRATER_DEPTH     = 0.18;
/** Crater: ejecta rim raised height in normalised units. */
const CRATER_RIM_H     = 0.06;

/** Dust Hill: radius (cells). 8-cell diameter ≈ 5wu smooth hill. */
const DUST_OUTER_R     = 8;
/** Dust Hill: peak elevation gain in normalised units. */
const DUST_PEAK_H      = 0.10;

// ─── Deformation helpers ──────────────────────────────────────────────────────

/**
 * Permanently carves a crater into the heightMap Float32Array in-place.
 *
 * Algorithm:
 *   d < INNER_R   →  parabolic bowl depression:  -CRATER_DEPTH·(1−d/INNER_R)²
 *   INNER_R ≤ d < OUTER_R → ejecta rim sine wave: +CRATER_RIM_H·sin(π·t)
 *                            where t = (d−INNER_R)/(OUTER_R−INNER_R)
 *
 * Values are clamped to [0, 1] to avoid terrain going underground.
 */
function carveCrater(heightMap: Float32Array, grid: GridNode, gs: number): void {
  const { x: cx, z: cz } = grid;
  for (let dz = -CRATER_OUTER_R; dz <= CRATER_OUTER_R; dz++) {
    const gz = cz + dz;
    if (gz < 0 || gz >= gs) continue;
    for (let dx = -CRATER_OUTER_R; dx <= CRATER_OUTER_R; dx++) {
      const gx = cx + dx;
      if (gx < 0 || gx >= gs) continue;
      const d   = Math.sqrt(dx * dx + dz * dz);
      const idx = gz * gs + gx;
      if (d < CRATER_INNER_R) {
        // Bowl depression — smoothstep-like parabola
        const t   = 1 - d / CRATER_INNER_R;
        heightMap[idx] = Math.max(0, heightMap[idx] - CRATER_DEPTH * t * t);
      } else if (d < CRATER_OUTER_R) {
        // Ejecta rim — sine wave rising from the bowl edge then falling off
        const t   = (d - CRATER_INNER_R) / (CRATER_OUTER_R - CRATER_INNER_R);
        const rim = CRATER_RIM_H * Math.sin(Math.PI * t);
        heightMap[idx] = Math.min(1, heightMap[idx] + rim);
      }
    }
  }
}

/**
 * Permanently raises a smooth dust-hill bump into the heightMap Float32Array in-place.
 *
 * Algorithm: Gaussian-like cosine bell:
 *   Δh = DUST_PEAK_H · cos²(π·d/(2·OUTER_R))   for d < OUTER_R
 *
 * The cos² gives a smooth, rounded hill with C1 continuity at the edges.
 * Values clamped to [0, 1].
 */
function raiseDustHill(heightMap: Float32Array, grid: GridNode, gs: number): void {
  const { x: cx, z: cz } = grid;
  for (let dz = -DUST_OUTER_R; dz <= DUST_OUTER_R; dz++) {
    const gz = cz + dz;
    if (gz < 0 || gz >= gs) continue;
    for (let dx = -DUST_OUTER_R; dx <= DUST_OUTER_R; dx++) {
      const gx = cx + dx;
      if (gx < 0 || gx >= gs) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= DUST_OUTER_R) continue;
      const idx  = gz * gs + gx;
      const bell = Math.cos((Math.PI * d) / (2 * DUST_OUTER_R));
      heightMap[idx] = Math.min(1, heightMap[idx] + DUST_PEAK_H * bell * bell);
    }
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface TerrainStore {
  terrain:       TerrainData | null;
  isGenerating:  boolean;
  config:        TerrainConfig;
  setTerrain:    (t: TerrainData) => void;
  setGenerating: (v: boolean) => void;
  updateConfig:  (partial: Partial<TerrainConfig>) => void;
  /**
   * Procedurally deforms the active heightMap based on the obstacle type.
   * Only acts on 'crater' and 'dust-mound' — boulder types are solid objects
   * sitting ON the surface and do not reshape it.
   *
   * Triggers a reactive terrain update by spreading into a new object reference.
   */
  deformTerrain: (grid: GridNode, variant: Obstacle['variant']) => void;
}

export const useTerrainStore = create<TerrainStore>((set, get) => ({
  terrain:      null,
  isGenerating: false,
  config: {
    gridSize:    GRID_SIZE,
    scale:       TERRAIN_SCALE,
    heightScale: TERRAIN_HEIGHT_SCALE,
    craterCount: CRATER_COUNT,
    seed:        42,
  },
  setTerrain:    (terrain)        => set({ terrain }),
  setGenerating: (isGenerating)   => set({ isGenerating }),
  updateConfig:  (partial)        => set((s) => ({ config: { ...s.config, ...partial } })),

  deformTerrain: (grid, variant) => {
    const { terrain } = get();
    if (!terrain) return;

    const gs = terrain.config.gridSize;

    if (variant === 'crater') {
      // Mutate in-place, then spread to new object to trigger React diff
      carveCrater(terrain.heightMap, grid, gs);
      set({ terrain: { ...terrain } });
    } else if (variant === 'dust-mound') {
      raiseDustHill(terrain.heightMap, grid, gs);
      set({ terrain: { ...terrain } });
    }
    // boulder-sm / boulder-md / boulder-lg / antenna → no terrain deformation
  },
}));
