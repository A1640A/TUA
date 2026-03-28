'use client';
import { useRef, useMemo } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useTerrainStore } from '@/store/terrainStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { useSimulationStore } from '@/store/simulationStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

const OBSTACLE_VARIANT_CONFIG = {
  'boulder-sm': { rx: 0.28, ry: 0.22 },
  'boulder-md': { rx: 0.45, ry: 0.36 },
  'boulder-lg': { rx: 0.65, ry: 0.52 },
  'crater':     { rx: 0.60, ry: 0.15 },
} as const;

/**
 * Renders all dynamically placed obstacles as physical boulders on the terrain.
 *
 * Click-to-place workflow:
 *  1. User clicks "Engel Ekle" in ControlPanel → triggers `placingObstacle` mode.
 *  2. User clicks any terrain point → `MoonTerrain` fires a separate handler
 *     (see updated MoonTerrain) that calls `obstacleStore.addObstacle`.
 *  3. This component renders each obstacle as a rough rocky mesh.
 *  4. Right-click on an existing obstacle removes it.
 *
 * Each boulder emissively pulses orange-red so it's clearly visible as a hazard.
 */
export default function ObstacleField() {
  const terrain   = useTerrainStore(s => s.terrain);
  const obstacles = useObstacleStore(s => s.obstacles);
  const removeObs = useObstacleStore(s => s.removeObstacle);

  // Per-obstacle material refs for the hazard pulse animation.
  const matsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    matsRef.current.forEach((mat, i) => {
      if (mat) mat.emissiveIntensity = 0.15 + Math.abs(Math.sin(t * 1.8 + i * 1.1)) * 0.35;
    });
  });

  if (!obstacles.length) return null;

  return (
    <>
      {obstacles.map((obs, i) => {
        const cfg  = OBSTACLE_VARIANT_CONFIG[obs.variant];
        const yPos = obs.worldPos[1] + cfg.ry;

        return (
          <group
            key={obs.id}
            position={[obs.worldPos[0], yPos, obs.worldPos[2]]}
            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              removeObs(obs.id);
            }}
          >
            {/* Main boulder body */}
            <mesh castShadow>
              <sphereGeometry args={[cfg.rx, 10, 8]} />
              <meshStandardMaterial
                ref={el => { if (el) matsRef.current[i] = el; }}
                color="#7a6550"
                roughness={0.95}
                metalness={0.05}
                emissive="#ff4400"
                emissiveIntensity={0.2}
              />
            </mesh>
            {/* Secondary irregular chunk for rocky look */}
            <mesh castShadow position={[cfg.rx * 0.4, cfg.ry * 0.3, cfg.rx * -0.3]}
              rotation={[0.4, 0.8, 0.2]}>
              <dodecahedronGeometry args={[cfg.rx * 0.55, 0]} />
              <meshStandardMaterial color="#6a5540" roughness={0.98} metalness={0.02} />
            </mesh>
            {/* Red hazard ring on ground */}
            <mesh position={[0, -cfg.ry + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[cfg.rx * 1.1, cfg.rx * 1.4, 24]} />
              <meshStandardMaterial
                color="#ff3300" emissive="#ff2200" emissiveIntensity={0.8}
                transparent opacity={0.55} side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
