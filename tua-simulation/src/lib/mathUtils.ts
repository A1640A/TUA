import * as THREE from 'three';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function gridToWorld(
  gridX: number,
  gridZ: number,
  gridSize: number,
  terrainScale: number
): THREE.Vector3 {
  const x = (gridX / gridSize - 0.5) * terrainScale;
  const z = (gridZ / gridSize - 0.5) * terrainScale;
  return new THREE.Vector3(x, 0, z);
}

export function worldToGrid(
  worldX: number,
  worldZ: number,
  gridSize: number,
  terrainScale: number
): { x: number; z: number } {
  const x = Math.round((worldX / terrainScale + 0.5) * gridSize);
  const z = Math.round((worldZ / terrainScale + 0.5) * gridSize);
  return { x: clamp(x, 0, gridSize - 1), z: clamp(z, 0, gridSize - 1) };
}

export function euclideanDistance(
  ax: number, az: number,
  bx: number, bz: number
): number {
  return Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
}

export function slopeAngleDeg(elevationDelta: number, horizontalDist: number): number {
  if (horizontalDist === 0) return 0;
  return Math.abs(Math.atan(elevationDelta / horizontalDist) * (180 / Math.PI));
}
