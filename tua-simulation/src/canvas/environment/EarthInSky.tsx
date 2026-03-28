'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function EarthInSky() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.04;
  });
  return (
    <mesh ref={meshRef} position={[-60, 55, -150]}>
      <sphereGeometry args={[10, 32, 32]} />
      <meshStandardMaterial
        color="#1a6bbf"
        emissive="#0a3060"
        emissiveIntensity={0.4}
        roughness={0.7}
        metalness={0.1}
      />
    </mesh>
  );
}
