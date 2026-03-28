import { create } from 'zustand';
import type { Obstacle, GridNode } from '@/types/simulation.types';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a grid cell to a Three.js world-space position.
 * Height is looked up in the caller-supplied heightMap (optional — defaults to 0).
 */
function gridToWorld(
  grid: GridNode,
  heightMap: Float32Array | null,
): [number, number, number] {
  const wx = (grid.x / GRID_SIZE - 0.5) * TERRAIN_SCALE;
  const wz = (grid.z / GRID_SIZE - 0.5) * TERRAIN_SCALE;
  const idx = grid.z * GRID_SIZE + grid.x;
  const wy  = heightMap ? (heightMap[idx] ?? 0) * TERRAIN_HEIGHT_SCALE : 0;
  return [wx, wy, wz];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ObstacleStore {
  /** All currently placed obstacles on the terrain. */
  obstacles: Obstacle[];
  /** Whether the user is in obstacle-placement drag mode. */
  placingObstacle: boolean;

  /** Add a new obstacle at the given grid cell. */
  addObstacle:     (grid: GridNode, variant: Obstacle['variant'], heightMap: Float32Array | null) => void;
  /** Remove a single obstacle by its ID. */
  removeObstacle:  (id: string) => void;
  /** Clear every obstacle (e.g., on terrain regeneration). */
  clearObstacles:  () => void;
  setPlacingObstacle: (v: boolean) => void;
}

let _nextId = 0;

export const useObstacleStore = create<ObstacleStore>((set) => ({
  obstacles:       [],
  placingObstacle: false,

  addObstacle: (grid, variant, heightMap) =>
    set((s) => {
      // Prevent stacking multiple obstacles on the same cell.
      if (s.obstacles.some((o) => o.grid.x === grid.x && o.grid.z === grid.z)) return s;
      const obstacle: Obstacle = {
        id:       `obs-${_nextId++}`,
        grid,
        variant,
        worldPos: gridToWorld(grid, heightMap),
      };
      return { obstacles: [...s.obstacles, obstacle] };
    }),

  removeObstacle: (id) =>
    set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),

  clearObstacles: () => set({ obstacles: [] }),

  setPlacingObstacle: (placingObstacle) => set({ placingObstacle }),
}));
