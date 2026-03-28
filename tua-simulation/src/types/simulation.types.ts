export type SimulationStatus =
  | 'idle'
  | 'calculating'
  | 'animating'
  | 'completed'
  | 'error';

export interface GridNode {
  x: number;
  z: number;
}

export interface Waypoint {
  id: string;
  type: 'start' | 'end';
  grid: GridNode;
}

export interface RoverState {
  position: [number, number, number];
  rotation: [number, number, number];
  pathProgress: number; // 0-1
}
