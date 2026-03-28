'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';

/**
 * RoutePath v3
 * - Passes heightMap to routePointsToVectors so each point's Y is
 *   computed via getWorldY() (terrain surface + sphere curvature).
 *   This prevents the tube from clipping into crater floors or floating
 *   over hills when the path crosses height variations.
 * - depthWrite=false + renderOrder=2 ensures the tube is always visible.
 */
export default function RoutePath() {
  const matRef      = useRef<THREE.MeshStandardMaterial>(null);
  const routeResult = useSimulationStore(s => s.routeResult);
  const terrain     = useTerrainStore(s => s.terrain);

  const tubeGeo = useMemo(() => {
    if (!routeResult?.path.length || routeResult.path.length < 2) return null;
    const hm   = terrain?.heightMap ?? undefined;
    const vecs = routePointsToVectors(routeResult.path, undefined, undefined, undefined, hm);
    const curve = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
    return new THREE.TubeGeometry(curve, vecs.length * 5, 0.055, 8, false);
  }, [routeResult, terrain]);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.emissiveIntensity = 1.4 + Math.sin(clock.elapsedTime * 2.8) * 0.65;
  });

  if (!tubeGeo) return null;

  return (
    <mesh geometry={tubeGeo} renderOrder={2}>
      <meshStandardMaterial
        ref={matRef}
        color="#00d4ff"
        emissive="#00d4ff"
        emissiveIntensity={1.4}
        roughness={0.08}
        metalness={0.6}
        transparent
        opacity={0.90}
        depthWrite={false}
      />
    </mesh>
  );
}
