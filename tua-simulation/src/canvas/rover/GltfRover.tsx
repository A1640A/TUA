'use client';
/**
 * GLTF Rover loader  ready for future integration.
 * To activate: set roverConfig.modelType = 'gltf' in your store/config.
 * Place your .glb file at: public/models/rover.glb
 */
import { useGLTF } from '@react-three/drei';

export function GltfRover({ path, position, rotation }: {
  path:     string;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const { scene } = useGLTF(path);

  return (
    <primitive
      object={scene.clone()}
      position={position}
      rotation={rotation}
      scale={0.8}
    />
  );
}

// Preload hint for when the path is known at build time
// useGLTF.preload('/models/rover.glb');
