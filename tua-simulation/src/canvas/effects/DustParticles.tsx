'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';

const PARTICLE_COUNT      = 400;
const WAKE_PARTICLE_COUNT = 80; // fast wheel-kick particles

/**
 * Dual-layer lunar dust particle system.
 *
 * Layer 1 — Dust Cloud (400 particles):
 *   Spawned behind the rover, biased opposite to its movement direction.
 *   Size fades from large (fresh) to small (dissipating) using a per-particle
 *   `sizes` Float32Array updated every frame for a `PointsMaterial.size` effect.
 *
 * Layer 2 — Wheel Kick (80 particles):
 *   High-speed, short-lifetime particles kicked sideways from the wheel line,
 *   simulating dust thrown by the spinning treads.
 *
 * Both layers are only rendered while status === 'animating'.
 */
export default function DustParticles() {
  const cloudRef = useRef<THREE.Points>(null);
  const kickRef  = useRef<THREE.Points>(null);
  const { roverState, status } = useSimulationStore();

  // ── Dust Cloud ─────────────────────────────────────────────────────────────
  const { cloudPos, cloudVel } = useMemo(() => {
    const cloudPos = new Float32Array(PARTICLE_COUNT * 3);
    const cloudVel = Array.from({ length: PARTICLE_COUNT }, () => ({
      vx: (Math.random() - 0.5) * 0.06,
      vy: Math.random() * 0.05 + 0.01,
      vz: (Math.random() - 0.5) * 0.06,
      life: Math.random(),
      maxLife: 0.6 + Math.random() * 0.8,
      size: 0.04 + Math.random() * 0.08,
    }));
    return { cloudPos, cloudVel };
  }, []);

  // ── Wheel Kick ─────────────────────────────────────────────────────────────
  const { kickPos, kickVel } = useMemo(() => {
    const kickPos = new Float32Array(WAKE_PARTICLE_COUNT * 3);
    const kickVel = Array.from({ length: WAKE_PARTICLE_COUNT }, () => ({
      vx: (Math.random() - 0.5) * 0.18,
      vy: Math.random() * 0.12,
      vz: (Math.random() - 0.5) * 0.18,
      life: Math.random(),
    }));
    return { kickPos, kickVel };
  }, []);

  useFrame(() => {
    if (status !== 'animating') return;

    const [rx, ry, rz] = roverState.position;
    // Back-spray direction: opposite to rover heading (Y rotation).
    const heading = roverState.rotation[1];
    const sprayX  = Math.sin(heading + Math.PI) * 0.4;
    const sprayZ  = Math.cos(heading + Math.PI) * 0.4;

    // ── Update dust cloud ────────────────────────────────────────────────────
    if (cloudRef.current) {
      const arr = cloudRef.current.geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const v = cloudVel[i];
        v.life += 0.016 / v.maxLife;

        if (v.life > 1) {
          // Respawn behind rover.
          v.life = 0;
          arr[i * 3]     = rx + sprayX + (Math.random() - 0.5) * 0.8;
          arr[i * 3 + 1] = ry + 0.05;
          arr[i * 3 + 2] = rz + sprayZ + (Math.random() - 0.5) * 0.8;
          v.vx = sprayX * 0.3 + (Math.random() - 0.5) * 0.05;
          v.vy = 0.02 + Math.random() * 0.04;
          v.vz = sprayZ * 0.3 + (Math.random() - 0.5) * 0.05;
        } else {
          arr[i * 3]     += v.vx;
          arr[i * 3 + 1] += v.vy;
          arr[i * 3 + 2] += v.vz;
          v.vy *= 0.97; // gravity drag
          v.vx *= 0.98;
          v.vz *= 0.98;
        }
      }
      cloudRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // ── Update wheel kick ────────────────────────────────────────────────────
    if (kickRef.current) {
      const arr = kickRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < WAKE_PARTICLE_COUNT; i++) {
        const v = kickVel[i];
        v.life += 0.035;
        if (v.life > 1) {
          v.life = 0;
          arr[i * 3]     = rx + (Math.random() - 0.5) * 1.4;
          arr[i * 3 + 1] = ry + 0.02;
          arr[i * 3 + 2] = rz + (Math.random() - 0.5) * 1.0;
          v.vx = (Math.random() - 0.5) * 0.18;
          v.vy = 0.04 + Math.random() * 0.08;
          v.vz = (Math.random() - 0.5) * 0.18;
        } else {
          arr[i * 3]     += v.vx;
          arr[i * 3 + 1] += v.vy;
          arr[i * 3 + 2] += v.vz;
          v.vy *= 0.92;
        }
      }
      kickRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Dust cloud — warm sandy colour */}
      <points ref={cloudRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[cloudPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.09} color="#d4b896"
          transparent opacity={0.45}
          sizeAttenuation depthWrite={false}
        />
      </points>

      {/* Wheel kick — bright, fast-fade */}
      <points ref={kickRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[kickPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.05} color="#e8d5bc"
          transparent opacity={0.65}
          sizeAttenuation depthWrite={false}
        />
      </points>
    </>
  );
}
