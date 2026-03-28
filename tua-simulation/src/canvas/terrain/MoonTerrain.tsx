'use client';
import { useRef, useMemo, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

export default function MoonTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  const terrain = useTerrainStore(s => s.terrain);
  const placementMode = useSimulationStore(s => s.placementMode);
  const setWaypoint   = useSimulationStore(s => s.setWaypoint);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SCALE, TERRAIN_SCALE,
      GRID_SIZE - 1, GRID_SIZE - 1
    );
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  useEffect(() => {
    if (!terrain || !geometry) return;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const h = terrain.heightMap[i] ?? 0;
      pos.setY(i, h * TERRAIN_HEIGHT_SCALE);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [terrain, geometry]);

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color:     new THREE.Color('#8a8a8a'),
    roughness: 0.92,
    metalness: 0.05,
    wireframe: false,
  }), []);

  // Convert world hit point to grid coordinates
  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!placementMode) return;
    e.stopPropagation();
    const wx = e.point.x;
    const wz = e.point.z;
    // Map world [-TERRAIN_SCALE/2, TERRAIN_SCALE/2] -> grid [0, GRID_SIZE]
    const gx = Math.round((wx / TERRAIN_SCALE + 0.5) * GRID_SIZE);
    const gz = Math.round((wz / TERRAIN_SCALE + 0.5) * GRID_SIZE);
    const clampedX = Math.max(0, Math.min(GRID_SIZE - 1, gx));
    const clampedZ = Math.max(0, Math.min(GRID_SIZE - 1, gz));
    setWaypoint(placementMode, { x: clampedX, z: clampedZ });
  }, [placementMode, setWaypoint]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      receiveShadow
      castShadow
      onClick={handleClick}
      onPointerEnter={() => { if (placementMode) document.body.style.cursor = 'crosshair'; }}
      onPointerLeave={() => { document.body.style.cursor = 'auto'; }}
    />
  );
}
