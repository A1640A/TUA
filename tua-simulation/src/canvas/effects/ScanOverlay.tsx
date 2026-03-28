'use client';
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

const MAX_VISIBLE_SCAN = 300; // max rings to show at once for perf

/**
 * Real-time A* scan-animation overlay.
 *
 * When the API returns `visitedNodes`, this component steps through the array
 * one frame at a time, rendering a brief glowing disc at each grid cell that
 * the A* algorithm expanded — giving judges a vivid window into the algorithm's
 * "thinking" process during dynamic reroutes.
 *
 * Transitions automatically to `animating` status once the scan is complete.
 */
export default function ScanOverlay() {
  const { visitedNodes, scanProgress, setScanProgress, status, setStatus } =
    useSimulationStore();
  const terrain = useTerrainStore(s => s.terrain);

  // Only active during the 'scanning' phase.
  const active = status === 'scanning' && visitedNodes.length > 0;

  // Build a lookup: nodeId → world position.
  const nodePositions = useMemo<Map<number, THREE.Vector3>>(() => {
    const map = new Map<number, THREE.Vector3>();
    if (!terrain) return map;
    visitedNodes.forEach(id => {
      const gx = id % GRID_SIZE;
      const gz = Math.floor(id / GRID_SIZE);
      const wx = (gx / GRID_SIZE - 0.5) * TERRAIN_SCALE;
      const wz = (gz / GRID_SIZE - 0.5) * TERRAIN_SCALE;
      const wy = (terrain.heightMap[id] ?? 0) * TERRAIN_HEIGHT_SCALE + 0.08;
      map.set(id, new THREE.Vector3(wx, wy, wz));
    });
    return map;
  }, [visitedNodes, terrain]);

  // Advance scan cursor ~8 nodes per frame (tuned so full scan takes ~1–2 s).
  useFrame(() => {
    if (!active) return;
    const next = Math.min(scanProgress + 8, visitedNodes.length);
    setScanProgress(next);
    if (next >= visitedNodes.length) {
      setStatus('animating');
    }
  });

  if (!active) return null;

  // Only render the most recent MAX_VISIBLE_SCAN nodes to keep draw calls bounded.
  const start  = Math.max(0, scanProgress - MAX_VISIBLE_SCAN);
  const visible = visitedNodes.slice(start, scanProgress);

  return (
    <>
      {visible.map((id, i) => {
        const pos = nodePositions.get(id);
        if (!pos) return null;

        // Fade out older nodes — freshest nodes are brightest.
        const age    = (i / visible.length);
        const alpha  = age * 0.75;
        const radius = 0.18 + age * 0.1;

        return (
          <mesh key={`scan-${id}`} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 0.5, radius, 8]} />
            <meshBasicMaterial
              color="#00d4ff"
              transparent
              opacity={alpha}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}
