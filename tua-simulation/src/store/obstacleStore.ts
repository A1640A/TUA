import { create } from 'zustand';
import type { Obstacle, GridNode } from '@/types/simulation.types';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';
import { getWorldY } from '@/canvas/terrain/MoonTerrain';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a grid cell to world-space position.
 *
 * Uses getWorldY() — the exact same function MoonTerrain.tsx uses — so
 * obstacle meshes are always co-planar with the terrain surface, including
 * any post-deformation crater/hill elevation changes.
 */
function gridToWorld(
  grid:      GridNode,
  heightMap: Float32Array | null,
): [number, number, number] {
  const wx  = (grid.x / GRID_SIZE - 0.5) * TERRAIN_SCALE;
  const wz  = (grid.z / GRID_SIZE - 0.5) * TERRAIN_SCALE;
  const wy  = heightMap ? getWorldY(heightMap, wx, wz) : 0;
  return [wx, wy, wz];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ObstacleStore {
  obstacles:       Obstacle[];
  placingObstacle: boolean;
  /** Currently selected obstacle variant for the next placement. */
  selectedVariant: Obstacle['variant'];

  addObstacle:        (
    grid:          GridNode,
    variant:       Obstacle['variant'],
    heightMap:     Float32Array | null,
    /** Called immediately after placement for crater/dust-mound terrain deformation. */
    deformTerrain: (grid: GridNode, variant: Obstacle['variant']) => void,
  ) => void;
  removeObstacle:     (id: string) => void;
  clearObstacles:     () => void;
  setPlacingObstacle: (v: boolean) => void;
  setSelectedVariant: (v: Obstacle['variant']) => void;
}

let _nextId = 0;

export const useObstacleStore = create<ObstacleStore>((set) => ({
  obstacles:       [],
  placingObstacle: false,
  selectedVariant: 'boulder-md',

  addObstacle: (grid, variant, heightMap, deformTerrain) =>
    set((s) => {
      if (s.obstacles.some((o) => o.grid.x === grid.x && o.grid.z === grid.z)) return s;
      const obstacle: Obstacle = {
        id:       `obs-${_nextId++}`,
        grid,
        variant,
        worldPos: gridToWorld(grid, heightMap),
      };
      // Deform terrain immediately for landscape-altering obstacle types.
      // This runs synchronously before the next render so MoonTerrain picks
      // up the changed heightMap in the same frame.
      deformTerrain(grid, variant);
      return { obstacles: [...s.obstacles, obstacle] };
    }),

  removeObstacle:     (id) => set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),
  clearObstacles:     ()  => set({ obstacles: [] }),
  setPlacingObstacle: (placingObstacle) => set({ placingObstacle }),
  setSelectedVariant: (selectedVariant) => set({ selectedVariant }),
}));
