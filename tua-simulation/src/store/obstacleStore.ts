import { create } from 'zustand';
import type { Obstacle, GridNode } from '@/types/simulation.types';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gridToWorld(
  grid:      GridNode,
  heightMap: Float32Array | null,
): [number, number, number] {
  const wx  = (grid.x / GRID_SIZE - 0.5) * TERRAIN_SCALE;
  const wz  = (grid.z / GRID_SIZE - 0.5) * TERRAIN_SCALE;
  const idx = grid.z * GRID_SIZE + grid.x;
  const wy  = heightMap ? (heightMap[idx] ?? 0) * TERRAIN_HEIGHT_SCALE : 0;
  return [wx, wy, wz];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ObstacleStore {
  obstacles:       Obstacle[];
  placingObstacle: boolean;
  /** Currently selected obstacle variant for the next placement. */
  selectedVariant: Obstacle['variant'];

  addObstacle:        (grid: GridNode, variant: Obstacle['variant'], heightMap: Float32Array | null) => void;
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

  addObstacle: (grid, variant, heightMap) =>
    set((s) => {
      if (s.obstacles.some((o) => o.grid.x === grid.x && o.grid.z === grid.z)) return s;
      const obstacle: Obstacle = {
        id:       `obs-${_nextId++}`,
        grid,
        variant,
        worldPos: gridToWorld(grid, heightMap),
      };
      return { obstacles: [...s.obstacles, obstacle] };
    }),

  removeObstacle:     (id) => set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),
  clearObstacles:     ()  => set({ obstacles: [] }),
  setPlacingObstacle: (placingObstacle) => set({ placingObstacle }),
  setSelectedVariant: (selectedVariant) => set({ selectedVariant }),
}));
