'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTerrainStore } from '@/store/terrainStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

const RING_COUNT = 30;

/**
 * Renders a danger-zone ring at each significant crater position.
 * Each ring pulses its emissive intensity sinusoidally with a per-ring
 * phase offset — producing a staggered "heartbeat" alert pattern.
 */
export default function CraterField() {
  const terrain  = useTerrainStore(s => s.terrain);
  const matsRef  = useRef<THREE.MeshStandardMaterial[]>([]);

  const { positions, scales } = useMemo(() => {
    if (!terrain) return { positions: [] as [number, number, number][], scales: [] as number[] };
    const pos: [number, number, number][] = [];
    const sc:  number[] = [];
    const { craterMap, heightMap } = terrain;

    let sampled = 0;
    for (let z = 2; z < GRID_SIZE - 2 && sampled < RING_COUNT; z += 4) {
      for (let x = 2; x < GRID_SIZE - 2 && sampled < RING_COUNT; x += 4) {
        const risk = craterMap[z * GRID_SIZE + x];
        if (risk > 0.55) {
          const wx = (x / GRID_SIZE - 0.5) * TERRAIN_SCALE;
          const wz = (z / GRID_SIZE - 0.5) * TERRAIN_SCALE;
          const wy = (heightMap[z * GRID_SIZE + x] ?? 0) * TERRAIN_HEIGHT_SCALE + 0.05;
          pos.push([wx, wy, wz]);
          sc.push(0.8 + risk * 1.5);
          sampled++;
        }
      }
    }
    return { positions: pos, scales: sc };
  }, [terrain]);

  // Staggered pulse per ring.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    matsRef.current.forEach((mat, i) => {
      if (mat) mat.emissiveIntensity = 0.3 + Math.sin(t * 2.2 + i * 0.7) * 0.5 + 0.5;
    });
  });

  if (!positions.length) return null;

  return (
    <>
      {positions.map((p, i) => (
        <mesh
          key={i}
          position={p}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[scales[i], 0.07, 8, 40]} />
          <meshStandardMaterial
            ref={el => { if (el) matsRef.current[i] = el; }}
            color="#ff4420"
            emissive="#ff2200"
            emissiveIntensity={0.6}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </>
  );
}
