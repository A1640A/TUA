'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSimulationStore } from '@/store/simulationStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';
import { useTerrainStore } from '@/store/terrainStore';

function gridToWorld(gx: number, gz: number, height: number = 0): [number, number, number] {
  return [
    (gx / GRID_SIZE - 0.5) * TERRAIN_SCALE,
    height * TERRAIN_HEIGHT_SCALE + 0.5,
    (gz / GRID_SIZE - 0.5) * TERRAIN_SCALE,
  ];
}

export default function Waypoints() {
  const waypoints = useSimulationStore(s => s.waypoints);
  const terrain   = useTerrainStore(s => s.terrain);

  return (
    <>
      {waypoints.map(wp => {
        const idx   = wp.grid.z * GRID_SIZE + wp.grid.x;
        const h     = terrain?.heightMap[idx] ?? 0;
        const pos   = gridToWorld(wp.grid.x, wp.grid.z, h);
        const color = wp.type === 'start' ? '#22c55e' : '#ef4444';
        const label = wp.type === 'start' ? 'S' : 'E';

        return (
          <group key={wp.id} position={pos}>
            <mesh castShadow>
              <sphereGeometry args={[0.35, 16, 16]} />
              <meshStandardMaterial
                color={color} emissive={color}
                emissiveIntensity={0.8} roughness={0.2}
              />
            </mesh>
            <Html center distanceFactor={18}>
              <div style={{
                color: 'white', fontWeight: 700, fontSize: '11px',
                background: color, borderRadius: '50%',
                width: 20, height: 20, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>{label}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
