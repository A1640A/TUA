'use client';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';
import { getWorldY } from '@/canvas/terrain/MoonTerrain';

/**
 * Waypoints v2 — uses getWorldY() (same as terrain mesh) so markers sit
 * precisely on the surface regardless of scale/height-scale changes.
 */
export default function Waypoints() {
  const waypoints = useSimulationStore(s => s.waypoints);
  const terrain   = useTerrainStore(s => s.terrain);

  return (
    <>
      {waypoints.map(wp => {
        // Convert grid → world XZ
        const wx = (wp.grid.x / GRID_SIZE - 0.5) * TERRAIN_SCALE;
        const wz = (wp.grid.z / GRID_SIZE - 0.5) * TERRAIN_SCALE;

        // Y: exact terrain surface + pole height
        const surfY = terrain?.heightMap
          ? getWorldY(terrain.heightMap, wx, wz)
          : 0;
        const pos: [number, number, number] = [wx, surfY + 0.45, wz];

        const color = wp.type === 'start' ? '#22c55e' : '#ef4444';
        const label = wp.type === 'start' ? 'S' : 'E';

        return (
          <group key={wp.id} position={pos}>
            {/* Beacon pole */}
            <mesh castShadow position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 1.0, 8]} />
              <meshStandardMaterial color="#aabbcc" metalness={0.7} roughness={0.3} />
            </mesh>

            {/* Glowing sphere at tip */}
            <mesh castShadow position={[0, 1.1, 0]}>
              <sphereGeometry args={[0.28, 16, 16]} />
              <meshStandardMaterial
                color={color} emissive={color}
                emissiveIntensity={1.1} roughness={0.2}
              />
            </mesh>

            {/* Ground ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={2}>
              <ringGeometry args={[0.35, 0.55, 32]} />
              <meshStandardMaterial
                color={color} emissive={color} emissiveIntensity={0.7}
                transparent opacity={0.6}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            <Html center distanceFactor={18}>
              <div style={{
                color: 'white', fontWeight: 700, fontSize: '11px',
                background: color, borderRadius: '50%',
                width: 20, height: 20, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 8px ${color}`,
              }}>{label}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
