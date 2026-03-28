export type RoverModelType = 'placeholder' | 'gltf';

export interface RoverConfig {
  modelType: RoverModelType;
  gltfPath?: string;         // e.g. '/models/rover.glb' — used when modelType='gltf'
  scale: number;
  color: string;
}
