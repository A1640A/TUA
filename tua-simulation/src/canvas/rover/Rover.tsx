'use client';
/**
 * Rover entry point.
 * Switch modelType to 'gltf' and provide gltfPath to use a real GLB model.
 */
import { useSimulationStore } from '@/store/simulationStore';
import PlaceholderRover from './PlaceholderRover';
import { GltfRover } from './GltfRover';

const MODEL_TYPE: 'placeholder' | 'gltf' = 'placeholder';
const GLTF_PATH = '/models/rover.glb';

export default function Rover() {
  const { roverState, status } = useSimulationStore();
  if (status === 'idle') return null;

  const props = {
    position: roverState.position,
    rotation: roverState.rotation,
  };

  return MODEL_TYPE === 'gltf'
    ? <GltfRover path={GLTF_PATH} {...props} />
    : <PlaceholderRover {...props} />;
}
