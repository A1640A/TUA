'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { ROVER_SPEED } from '@/lib/constants';

/**
 * Detailed procedural rover mesh — swap-ready for a real GLB via Rover.tsx.
 *
 * Improvements over the original placeholder:
 * - Each wheel mesh has its own `useRef` — no fragile `children[n]` indexing.
 * - Wheels spin around their axle axis (X-axis) at a speed proportional to
 *   the rover's forward velocity during the `animating` state.
 * - Subtle body roll is added via a sinusoidal animation when moving.
 * - Sensor camera on the mast rotates slowly to simulate active scanning.
 * - Emissive sensor head is cyan to match the path-tube colour palette.
 */
export default function PlaceholderRover({ position, rotation }: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const groupRef  = useRef<THREE.Group>(null);
  const bodyRef   = useRef<THREE.Mesh>(null);

  // Independent refs for each wheel (FL, FR, RL, RR).
  const wheelFL = useRef<THREE.Mesh>(null);
  const wheelFR = useRef<THREE.Mesh>(null);
  const wheelRL = useRef<THREE.Mesh>(null);
  const wheelRR = useRef<THREE.Mesh>(null);
  const wheels  = [wheelFL, wheelFR, wheelRL, wheelRR];

  const mastCamRef = useRef<THREE.Mesh>(null);

  const status = useSimulationStore(s => s.status);
  const speed  = useSimulationStore(s => s.roverState.speed);

  useFrame(({ clock }) => {
    const moving = status === 'animating';
    const t      = clock.getElapsedTime();

    // Wheel spin — rotation around local X axis.
    const spinDelta = moving ? (ROVER_SPEED * 6) : 0;
    wheels.forEach(w => { if (w.current) w.current.rotation.x -= spinDelta; });

    // Body gentle roll when moving.
    if (bodyRef.current) {
      bodyRef.current.rotation.z = moving ? Math.sin(t * 8) * 0.025 : 0;
    }

    // Mast camera slow scan rotation.
    if (mastCamRef.current) {
      mastCamRef.current.rotation.y = Math.sin(t * 0.8) * Math.PI * 0.35;
    }
  });

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* ── Chassis / body ─────────────────────────────────────────────── */}
      <mesh ref={bodyRef} castShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.4, 0.35, 0.9]} />
        <meshStandardMaterial color="#c0c8d8" metalness={0.65} roughness={0.28} />
      </mesh>

      {/* ── Solar panel (top) ──────────────────────────────────────────── */}
      <mesh position={[0, 0.56, 0]}>
        <boxGeometry args={[1.6, 0.04, 1.1]} />
        <meshStandardMaterial
          color="#1a3a6a" metalness={0.85} roughness={0.18}
          emissive="#1a3a6a" emissiveIntensity={0.4}
        />
      </mesh>

      {/* ── Underbelly / frame rails ───────────────────────────────────── */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[1.2, 0.08, 0.7]} />
        <meshStandardMaterial color="#888fa0" metalness={0.8} roughness={0.4} />
      </mesh>

      {/* ── Wheels — FL FR RL RR ──────────────────────────────────────── */}
      <mesh ref={wheelFL} position={[-0.65, 0.12, -0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.14, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} />
      </mesh>
      <mesh ref={wheelFR} position={[ 0.65, 0.12, -0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.14, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} />
      </mesh>
      <mesh ref={wheelRL} position={[-0.65, 0.12,  0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.14, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} />
      </mesh>
      <mesh ref={wheelRR} position={[ 0.65, 0.12,  0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.19, 0.19, 0.14, 20]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} />
      </mesh>

      {/* ── Wheel hub caps (accent colour) ────────────────────────────── */}
      {([ [-0.72, 0.12, -0.55], [0.72, 0.12, -0.55], [-0.72, 0.12, 0.55], [0.72, 0.12, 0.55] ] as const).map((p, i) => (
        <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.02, 12]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.5} metalness={0.9} />
        </mesh>
      ))}

      {/* ── Mast ──────────────────────────────────────────────────────── */}
      <mesh position={[0.3, 0.75, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.55, 8]} />
        <meshStandardMaterial color="#aabbcc" metalness={0.92} roughness={0.15} />
      </mesh>

      {/* ── Camera head (rotates independently) ───────────────────────── */}
      <group ref={mastCamRef} position={[0.3, 1.06, 0]}>
        <mesh>
          <boxGeometry args={[0.14, 0.08, 0.08]} />
          <meshStandardMaterial color="#c8d4e0" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Lens emissive dot */}
        <mesh position={[0.08, 0, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={2.0} />
        </mesh>
      </group>

      {/* ── RTG power unit (back) ─────────────────────────────────────── */}
      <mesh position={[-0.55, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.28, 12]} />
        <meshStandardMaterial color="#7a8090" metalness={0.7} roughness={0.5}
          emissive="#ff6020" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}
