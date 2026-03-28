'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';

/**
 * Renders a smooth, fading trail behind the rover showing the path already
 * traversed. Uses a TubeGeometry cropped to the current progress for a
 * dynamic "tyre tracks" visual in a warm amber/orange colour.
 */
export default function RoverTrail() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { routeResult, roverState } = useSimulationStore();

  const trailGeo = useMemo(() => {
    if (!routeResult?.path.length) return null;
    const all    = routePointsToVectors(routeResult.path);
    const cutoff = Math.max(2, Math.ceil(all.length * roverState.pathProgress));
    const slice  = all.slice(0, cutoff);
    if (slice.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(slice, false, 'catmullrom', 0.5);
    return new THREE.TubeGeometry(curve, slice.length * 3, 0.045, 6, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeResult, roverState.pathProgress]);

  // Subtle pulse to differentiate the trail from the full path tube.
  useFrame(({ clock }) => {
    if (!matRef.current) return;
    matRef.current.emissiveIntensity = 0.5 + Math.sin(clock.elapsedTime * 3.5) * 0.2;
  });

  if (!trailGeo) return null;

  return (
    <mesh geometry={trailGeo}>
      <meshStandardMaterial
        ref={matRef}
        color="#f59e0b"
        emissive="#f59e0b"
        emissiveIntensity={0.5}
        roughness={0.2}
        metalness={0.4}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}
