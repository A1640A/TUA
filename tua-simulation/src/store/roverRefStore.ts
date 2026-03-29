/**
 * roverRefStore — Rover World Matrix Bridge
 *
 * Problem: Two independent Canvas instances cannot share THREE.js refs.
 * Solution: PlaceholderRover writes its world matrix + rotation every frame
 *   into this Zustand store. FPVCamera reads from it in the second Canvas context.
 *
 * Only a Float32Array (16 elements, matrix4 elements) and the rover's
 * euler rotation are stored — no Three.js objects cross the store boundary.
 */
import { create } from 'zustand';

interface RoverRefStore {
  /** Rover's world matrix as a flat 16-element Float32Array (column-major, THREE convention). */
  worldMatrix: Float32Array;
  /** Rover position in world space [x, y, z] — cached for fast reads. */
  worldPos: [number, number, number];
  /** Timestamp of the last update (performance.now() ms). Used to detect stale data. */
  lastUpdate: number;

  /** Called by PlaceholderRover every frame with fresh data. */
  setRoverMatrix: (matrix: Float32Array, pos: [number, number, number]) => void;
}

export const useRoverRefStore = create<RoverRefStore>((set) => ({
  worldMatrix: new Float32Array(16).fill(0).map((_, i) =>
    // Identity matrix (1s on diagonal)
    i % 5 === 0 ? 1 : 0
  ),
  worldPos:    [0, 0, 0],
  lastUpdate:  0,

  setRoverMatrix: (matrix, pos) => set({
    worldMatrix: matrix,
    worldPos:    pos,
    lastUpdate:  performance.now(),
  }),
}));
