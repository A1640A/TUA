'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';

/**
 * Renders the A* calculated route as a glowing tube mesh that pulses with a
 * sinusoidal emissive animation — visible through the bloom post-processing.
 *
 * Replaces the previous static `<Line>` with a `TubeGeometry` so the path
 * has physical volume and responds to lighting as well as emissive bloom.
 */
export default function RoutePath() {
  const matRef      = useRef<THREE.MeshStandardMaterial>(null);
  const routeResult = useSimulationStore(s => s.routeResult);

  const tubeGeo = useMemo(() => {
    if (!routeResult?.path.length || routeResult.path.length < 2) return null;
    const vecs  = routePointsToVectors(routeResult.path);
    const curve = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
    // TubeGeometry: curve, tubularSegments, radius, radialSegments, closed
    return new THREE.TubeGeometry(curve, vecs.length * 4, 0.07, 8, false);
  }, [routeResult]);

  // Pulse emissive intensity: 0.8 → 2.2 → 0.8 over ~2.4 s
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.emissiveIntensity = 1.5 + Math.sin(clock.elapsedTime * 2.6) * 0.7;
  });

  if (!tubeGeo) return null;

  return (
    <mesh geometry={tubeGeo}>
      <meshStandardMaterial
        ref={matRef}
        color="#00d4ff"
        emissive="#00d4ff"
        emissiveIntensity={1.5}
        roughness={0.1}
        metalness={0.5}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

/** Export the route curve for rover/trail animation reuse. */
export function useRouteCurve(): THREE.CatmullRomCurve3 | null {
  const routeResult = useSimulationStore(s => s.routeResult);
  return useMemo(() => {
    if (!routeResult?.path.length || routeResult.path.length < 2) return null;
    const vecs = routePointsToVectors(routeResult.path);
    return new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
  }, [routeResult]);
}
