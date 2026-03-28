'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';

const PARTICLE_COUNT = 60;

export default function DustParticles() {
  const ref = useRef<THREE.Points>(null);
  const { roverState, status } = useSimulationStore();

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = Array.from({ length: PARTICLE_COUNT }, () => ({
      vx: (Math.random() - 0.5) * 0.05,
      vy: Math.random() * 0.04,
      vz: (Math.random() - 0.5) * 0.05,
      life: Math.random(),
    }));
    return { positions: pos, velocities: vel };
  }, []);

  useFrame(() => {
    if (!ref.current || status !== 'animating') return;
    const arr = ref.current.geometry.attributes.position.array as Float32Array;
    const [rx, ry, rz] = roverState.position;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = velocities[i];
      v.life += 0.02;
      if (v.life > 1) {
        v.life = 0;
        arr[i * 3]     = rx + (Math.random() - 0.5) * 0.6;
        arr[i * 3 + 1] = ry;
        arr[i * 3 + 2] = rz + (Math.random() - 0.5) * 0.6;
        v.vx = (Math.random() - 0.5) * 0.05;
        v.vy = Math.random() * 0.04;
        v.vz = (Math.random() - 0.5) * 0.05;
      } else {
        arr[i * 3]     += v.vx;
        arr[i * 3 + 1] += v.vy;
        arr[i * 3 + 2] += v.vz;
        v.vy *= 0.96;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#c8b89a" transparent opacity={0.5} sizeAttenuation />
    </points>
  );
}
