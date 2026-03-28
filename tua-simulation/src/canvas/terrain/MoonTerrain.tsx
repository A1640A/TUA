'use client';
import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useTerrainStore } from '@/store/terrainStore';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

export default function MoonTerrain() {
  const meshRef = useRef<THREE.Mesh>(null);
  const terrain = useTerrainStore(s => s.terrain);

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

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} receiveShadow castShadow />
  );
}
