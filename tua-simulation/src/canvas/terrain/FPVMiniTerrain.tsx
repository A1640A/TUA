'use client';
/**
 * FPVMiniTerrain — Optimised Terrain for the FPV Cockpit Canvas.
 *
 * This is a lightweight version of MoonTerrain designed for the secondary
 * mini Canvas. Key differences from the main terrain:
 *
 *  • Segment count halved: (GRID_SIZE/2 - 1) × (GRID_SIZE/2 - 1) ≈ 4096 quads
 *    vs. main terrain's 16129 quads. ~4× fewer vertices.
 *  • No interaction handlers (no click/hover — FPV canvas is read-only).
 *  • Same getHeightAt() function → identical visual surface, just coarser.
 *  • Same colour palette as main terrain (crater floors, slope rocks, rims).
 *  • Uses the same heightMap from terrainStore → perfect visual consistency.
 */

import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { useTerrainStore } from '@/store/terrainStore';
import { getHeightAt } from '@/lib/terrainSampler';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';

// Half the segments of the main terrain for performance
const FPV_SEGMENTS = Math.floor(GRID_SIZE / 2) - 1;

export default function FPVMiniTerrain() {
  const terrain   = useTerrainStore(s => s.terrain);
  const lunarTex  = useLoader(THREE.TextureLoader, '/lunar-displacement.jpg');

  useMemo(() => {
    if (!lunarTex) return;
    lunarTex.wrapS = lunarTex.wrapT = THREE.RepeatWrapping;
    lunarTex.repeat.set(1, 1);
    // Lower anisotropy for perf in mini canvas
    lunarTex.anisotropy = 4;
    lunarTex.minFilter  = THREE.LinearMipmapLinearFilter;
    lunarTex.magFilter  = THREE.LinearFilter;
  }, [lunarTex]);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      TERRAIN_SCALE, TERRAIN_SCALE,
      FPV_SEGMENTS, FPV_SEGMENTS,
    );
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  // Bake vertex Y from same heightMap — same visual result at lower resolution
  useEffect(() => {
    if (!terrain || !geometry) return;

    const pos    = geometry.attributes.position as THREE.BufferAttribute;
    const uvAttr = geometry.attributes.uv       as THREE.BufferAttribute;
    const count  = pos.count;

    let colBuf = geometry.attributes.color as THREE.BufferAttribute | undefined;
    if (!colBuf || colBuf.count !== count) {
      colBuf = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute('color', colBuf);
    }

    const regolithColor = new THREE.Color('#606878');
    const slopeColor    = new THREE.Color('#907258');
    const craterFloor   = new THREE.Color('#1e1a16');
    const rimHighlight  = new THREE.Color('#aabbc8');
    const tmp           = new THREE.Color();

    const gridHalf = Math.floor(GRID_SIZE / 2);

    for (let i = 0; i < count; i++) {
      const u  = uvAttr.getX(i);
      const v  = uvAttr.getY(i);
      const wx = (u - 0.5) * TERRAIN_SCALE;
      const wz = (0.5 - v) * TERRAIN_SCALE;

      pos.setY(i, getHeightAt(terrain.heightMap, wx, wz));

      // Coarser grid sample (half resolution)
      const gx  = Math.max(0, Math.min(gridHalf - 1, Math.round(u * (gridHalf - 1))));
      const gz  = Math.max(0, Math.min(gridHalf - 1, Math.round((1 - v) * (gridHalf - 1))));
      // Map to full grid for slope/crater data
      const fgx = Math.min(GRID_SIZE - 1, gx * 2);
      const fgz = Math.min(GRID_SIZE - 1, gz * 2);
      const idx = fgz * GRID_SIZE + fgx;

      const slope = Math.min((terrain.slopeMap[idx]  ?? 0) * 3.2, 1.0);
      const crat  = Math.min((terrain.craterMap[idx] ?? 0),       1.0);

      tmp.lerpColors(regolithColor, slopeColor, slope);
      if (crat > 0.55) tmp.lerpColors(tmp, craterFloor, (crat - 0.55) / 0.45);
      if (crat > 0.15 && crat < 0.50) {
        const rimT = 1 - Math.abs((crat - 0.32) / 0.18);
        tmp.lerpColors(tmp, rimHighlight, Math.max(0, rimT) * 0.35);
      }

      colBuf.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }

    pos.needsUpdate    = true;
    colBuf.needsUpdate = true;
    geometry.computeVertexNormals();
  }, [terrain, geometry]);

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness:    0.92,
      metalness:    0.02,
      color:        new THREE.Color('#888ea0'),
    });
    if (lunarTex) mat.map = lunarTex;
    return mat;
  }, [lunarTex]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      receiveShadow
    />
  );
}
