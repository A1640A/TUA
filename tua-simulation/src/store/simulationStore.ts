import { create } from 'zustand';
import type { SimulationStatus, RoverState, Waypoint, GridNode } from '@/types/simulation.types';
import type { RouteResponse } from '@/services/types/routeContract';
import type { CostWeights } from '@/services/types/routeContract';
import {
  DEFAULT_SLOPE_WEIGHT,
  DEFAULT_CRATER_RISK_WEIGHT,
  DEFAULT_ELEVATION_WEIGHT,
} from '@/lib/constants';

export type PlacementMode = 'start' | 'end' | null;
export type CameraMode = 'orbit' | 'fpv';

interface SimulationStore {
  status:         SimulationStatus;
  waypoints:      Waypoint[];
  routeResult:    RouteResponse | null;
  roverState:     RoverState;
  costWeights:    CostWeights;
  error:          string | null;
  placementMode:  PlacementMode;

  // ── Camera mode ─────────────────────────────────────────────────────────────
  /** 'orbit' = top-down OrbitControls  |  'fpv' = mast-mounted first-person view. */
  cameraMode:     CameraMode;

  // ── Scan animation ──────────────────────────────────────────────────────────
  /** Ordered grid-cell IDs returned by A* (when ReturnVisited = true). */
  visitedNodes:   number[];
  /** Index into visitedNodes currently being rendered (0 → length). */
  scanProgress:   number;

  // ── Mission clock ───────────────────────────────────────────────────────────
  /** Unix timestamp (ms) when the first route was calculated. Null until then. */
  missionStartMs: number | null;

  // ── Clearance bounds visualizer ─────────────────────────────────────────────
  /**
   * When true, renders a holographic wireframe box around the rover that
   * visualises the exact C-Space clearance radius used by the A* backend.
   * Intended for competition judges / debugging.
   */
  showClearanceBounds: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────────
  setStatus:        (s: SimulationStatus) => void;
  setWaypoint:      (type: 'start' | 'end', grid: GridNode) => void;
  setRouteResult:   (r: RouteResponse | null) => void;
  setRoverState:    (rs: Partial<RoverState>) => void;
  setCostWeights:   (w: Partial<CostWeights>) => void;
  setError:         (e: string | null) => void;
  setPlacementMode: (m: PlacementMode) => void;
  setCameraMode:    (m: CameraMode) => void;
  setVisitedNodes:  (nodes: number[]) => void;
  setScanProgress:  (idx: number) => void;
  startMissionClock: () => void;
  toggleClearanceBounds: () => void;
  reset:            () => void;
}

const defaultRover: RoverState = {
  position:     [0, 0, 0],
  rotation:     [0, 0, 0],
  pathProgress: 0,
  speed:        0,
  heading:      0,
  elevation:    0,
  wheelHeights: [0, 0, 0, 0],
};

export const useSimulationStore = create<SimulationStore>((set) => ({
  status:         'idle',
  waypoints:      [],
  routeResult:    null,
  roverState:     defaultRover,
  placementMode:  null,
  cameraMode:     'orbit',
  visitedNodes:   [],
  scanProgress:   0,
  missionStartMs: null,
  costWeights: {
    slopeWeight:      DEFAULT_SLOPE_WEIGHT,
    craterRiskWeight:  DEFAULT_CRATER_RISK_WEIGHT,
    elevationWeight:  DEFAULT_ELEVATION_WEIGHT,
  },
  error: null,
  showClearanceBounds: false,

  setStatus:        (status)      => set({ status }),
  setWaypoint:      (type, grid)  => set((s) => {
    const existing = s.waypoints.filter(w => w.type !== type);
    return { waypoints: [...existing, { id: type, type, grid }], placementMode: null };
  }),
  setRouteResult:   (routeResult) => set({ routeResult }),
  setRoverState:    (rs)          => set((s) => ({ roverState: { ...s.roverState, ...rs } })),
  setCostWeights:   (w)           => set((s) => ({ costWeights: { ...s.costWeights, ...w } })),
  setError:         (error)       => set({ error }),
  setPlacementMode: (placementMode) => set({ placementMode }),
  setCameraMode:    (cameraMode)    => set({ cameraMode }),
  setVisitedNodes:  (visitedNodes)  => set({ visitedNodes, scanProgress: 0 }),
  setScanProgress:  (scanProgress)  => set({ scanProgress }),
  startMissionClock: ()             => set((s) => ({
    missionStartMs: s.missionStartMs ?? Date.now(),
  })),
  toggleClearanceBounds: ()         => set((s) => ({ showClearanceBounds: !s.showClearanceBounds })),
  reset: () => set({
    status: 'idle', routeResult: null,
    roverState: defaultRover, error: null, placementMode: null,
    cameraMode: 'orbit',
    visitedNodes: [], scanProgress: 0, missionStartMs: null,
  }),
}));
