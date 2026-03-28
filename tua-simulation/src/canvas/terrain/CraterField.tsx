'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useTerrainStore } from '@/store/terrainStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

const RING_COUNT = 30;

export default function CraterField() {
  const terrain = useTerrainStore(s => s.terrain);

  const { positions, scales } = useMemo(() => {
    if (!terrain) return { positions: [], scales: [] };
    const pos: [number, number, number][] = [];
    const sc: number[] = [];
    const { craterMap, heightMap } = terrain;

    // Sample high crater-risk cells for ring markers
    let sampled = 0;
    for (let z = 2; z < GRID_SIZE - 2 && sampled < RING_COUNT; z += 4) {
      for (let x = 2; x < GRID_SIZE - 2 && sampled < RING_COUNT; x += 4) {
        const risk = craterMap[z * GRID_SIZE + x];
        if (risk > 0.55) {
          const wx = (x / GRID_SIZE - 0.5) * TERRAIN_SCALE;
          const wz = (z / GRID_SIZE - 0.5) * TERRAIN_SCALE;
          const wy = (heightMap[z * GRID_SIZE + x] ?? 0) * TERRAIN_HEIGHT_SCALE;
          pos.push([wx, wy, wz]);
          sc.push(0.8 + risk * 1.5);
          sampled++;
        }
      }
    }
    return { positions: pos, scales: sc };
  }, [terrain]);

  if (!positions.length) return null;

  return (
    <>
      {positions.map((p, i) => (
        <mesh key={i} position={p}>
          <torusGeometry args={[scales[i], 0.08, 8, 32]} />
          <meshStandardMaterial
            color="#ff4444"
            emissive="#ff2200"
            emissiveIntensity={0.6}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}
    </>
  );
}
