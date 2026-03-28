'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** Futuristic geometry rover — swap-ready for GLTF via Rover.tsx */
export default function PlaceholderRover({ position, rotation }: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (groupRef.current) {
      const child = groupRef.current.children[4];
      if (child) child.rotation.z = Math.sin(Date.now() * 0.003) * 0.08;
    }
  });

  const wheelXPositions: number[] = [-0.65, 0.65];
  const wheelZPositions: number[] = [-0.55, 0.55];

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Body */}
      <mesh castShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.4, 0.35, 0.9]} />
        <meshStandardMaterial color="#c0c8d8" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Solar panel top */}
      <mesh position={[0, 0.56, 0]}>
        <boxGeometry args={[1.6, 0.04, 1.1]} />
        <meshStandardMaterial
          color="#1a3a6a"
          metalness={0.8}
          roughness={0.2}
          emissive="#1a3a6a"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Wheels x4 */}
      {wheelXPositions.flatMap(x =>
        wheelZPositions.map(wz => {
          const key = `wheel-${x}-${wz}`;
          return (
            <mesh key={key} position={[x, 0.12, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
              <meshStandardMaterial color="#333" roughness={0.9} />
            </mesh>
          );
        })
      )}

      {/* Mast */}
      <mesh position={[0.3, 0.75, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.5, 8]} />
        <meshStandardMaterial color="#aabbcc" metalness={0.9} />
      </mesh>

      {/* Sensor head */}
      <mesh position={[0.32, 1.02, 0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}
