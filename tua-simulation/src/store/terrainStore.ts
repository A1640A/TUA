import { create } from 'zustand';
import type { TerrainData, TerrainConfig } from '@/types/terrain.types';
import {
  GRID_SIZE, TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, CRATER_COUNT,
} from '@/lib/constants';

interface TerrainStore {
  terrain:       TerrainData | null;
  isGenerating:  boolean;
  config:        TerrainConfig;
  setTerrain:    (t: TerrainData) => void;
  setGenerating: (v: boolean) => void;
  updateConfig:  (partial: Partial<TerrainConfig>) => void;
}

export const useTerrainStore = create<TerrainStore>((set) => ({
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
}));
