// ─── Simulation State ─────────────────────────────────────────────────────────

/**
 * Lifecycle states of a single simulation session.
 * - `idle`        : No route has been calculated yet.
 * - `calculating` : Route request is in-flight to the C# API.
 * - `scanning`    : Visited-node scan animation is playing after a recalculation.
 * - `animating`   : Rover is traversing the calculated path.
 * - `rerouting`   : A mid-drive obstacle triggered a recalculation.
 * - `completed`   : Rover reached the destination.
 * - `error`       : The last operation failed.
 */
export type SimulationStatus =
  | 'idle'
  | 'calculating'
  | 'scanning'
  | 'animating'
  | 'rerouting'
  | 'completed'
  | 'error';

// ─── Grid & World ─────────────────────────────────────────────────────────────

/** An (x, z) integer coordinate in the pathfinding grid. */
export interface GridNode {
  x: number;
  z: number;
}

/** A named navigation waypoint (start or end). */
export interface Waypoint {
  id:   string;
  type: 'start' | 'end';
  grid: GridNode;
}

// ─── Rover ────────────────────────────────────────────────────────────────────

/** Live world-space state of the rover during animation. */
export interface RoverState {
  /** Three.js world-space position [x, y, z]. */
  position:     [number, number, number];
  /** Euler rotation [x, y, z] in radians. */
  rotation:     [number, number, number];
  /** Path completion ratio in [0, 1]. */
  pathProgress: number;
  /** Instantaneous speed in simulation units per second. */
  speed:        number;
  /** Heading azimuth in degrees [0, 360) measured clockwise from North (+Z). */
  heading:      number;
  /** Current terrain elevation in Three.js units. */
  elevation:    number;
}

// ─── Obstacles ────────────────────────────────────────────────────────────────

/** A dynamically placed obstacle on the lunar surface. */
export interface Obstacle {
  /** Unique identifier. */
  id:   string;
  /** Grid cell this obstacle occupies. */
  grid: GridNode;
  /**
   * Obstacle visual variant — determines both the 3D mesh rendered and the
   * A* blocker radius applied in terrainSerializer.
   *
   * | Variant        | Blocker radius | Description                     |
   * |----------------|----------------|---------------------------------|
   * | boulder-sm     | 1 (diamond)    | Small sharp-edged lunar rock    |
   * | boulder-md     | 1 (diamond)    | Medium irregular boulder        |
   * | boulder-lg     | 2 (diamond)    | Large boulder formation         |
   * | crater         | 2 (diamond)    | Impact crater — wide danger zone|
   * | dust-mound     | 1 (diamond)    | Soft regolith mound             |
   * | antenna        | 1 (diamond)    | Crashed probe/antenna debris    |
   */
  variant: 'boulder-sm' | 'boulder-md' | 'boulder-lg' | 'crater' | 'dust-mound' | 'antenna';
  /** World-space position (derived from grid at placement time). */
  worldPos: [number, number, number];
}
