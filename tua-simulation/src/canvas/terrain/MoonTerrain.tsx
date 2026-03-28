'use client';
import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

/**
 * Renders the procedurally generated lunar surface mesh.
 * Handles all pointer interactions:
 *   - `placementMode` ('start'|'end') → set waypoint on click
 *   - `placingObstacle` → add obstacle on click
 */
export default function MoonTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  const terrain = useTerrainStore(s => s.terrain);
  const placementMode    = useSimulationStore(s => s.placementMode);
  const setWaypoint      = useSimulationStore(s => s.setWaypoint);
  const placingObstacle    = useObstacleStore(s => s.placingObstacle);
  const addObstacle        = useObstacleStore(s => s.addObstacle);
  const selectedVariant    = useObstacleStore(s => s.selectedVariant);
  const setPlacingObstacle = useObstacleStore(s => s.setPlacingObstacle);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SCALE, TERRAIN_SCALE,
      GRID_SIZE - 1, GRID_SIZE - 1,
    );
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  useEffect(() => {
    if (!terrain || !geometry) return;
    const pos    = geometry.attributes.position as THREE.BufferAttribute;
    const count  = pos.count;

    let colBuf = geometry.attributes.color as THREE.BufferAttribute | undefined;
    if (!colBuf || colBuf.count !== count) {
      colBuf = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute('color', colBuf);
    }

    const flatColor  = new THREE.Color('#6e7a8a');
    const slopeColor = new THREE.Color('#b07850');
    const tmp = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const h = terrain.heightMap[i] ?? 0;
      const s = Math.min(terrain.slopeMap[i] ?? 0, 1);
      pos.setY(i, h * TERRAIN_HEIGHT_SCALE);
      tmp.lerpColors(flatColor, slopeColor, s * 2.2);
      colBuf.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }

    pos.needsUpdate    = true;
    colBuf.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [terrain, geometry]);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.93,
    metalness:    0.04,
  }), []);

  const worldToGrid = (wx: number, wz: number) => ({
    x: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((wx / TERRAIN_SCALE + 0.5) * GRID_SIZE))),
    z: Math.max(0, Math.min(GRID_SIZE - 1, Math.round((wz / TERRAIN_SCALE + 0.5) * GRID_SIZE))),
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const grid = worldToGrid(e.point.x, e.point.z);

    if (placementMode) {
      setWaypoint(placementMode, grid);
    } else if (placingObstacle) {
      addObstacle(grid, selectedVariant, terrain?.heightMap ?? null);
      setPlacingObstacle(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementMode, placingObstacle, selectedVariant, terrain]);

  const crosshair = placementMode || placingObstacle;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow
      onClick={handleClick}
      onPointerEnter={() => { if (crosshair) document.body.style.cursor = 'crosshair'; }}
      onPointerLeave={() => { document.body.style.cursor = 'auto'; }}
    />
  );
}
