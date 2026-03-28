'use client';
import { useEffect } from 'react';
import { useTerrainStore } from '@/store/terrainStore';
import { generateTerrain } from '@/services/terrain/heightmapGenerator';

export function useTerrain() {
  const { config, setTerrain, setGenerating } = useTerrainStore();

  useEffect(() => {
    setGenerating(true);
    // Run in a microtask to avoid blocking first render
    const id = setTimeout(() => {
      const data = generateTerrain(config);
      setTerrain(data);
      setGenerating(false);
    }, 0);
    return () => clearTimeout(id);
  }, [config.seed, config.gridSize, config.craterCount]); // eslint-disable-line

  return useTerrainStore((s) => s.terrain);
}
