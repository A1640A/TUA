import { create } from 'zustand';
import type { SimulationStatus, RoverState, Waypoint, GridNode } from '@/types/simulation.types';
import type { RouteResponse } from '@/services/types/routeContract';
import type { CostWeights } from '@/services/types/routeContract';
import {
  DEFAULT_SLOPE_WEIGHT,
  DEFAULT_CRATER_RISK_WEIGHT,
  DEFAULT_ELEVATION_WEIGHT,
} from '@/lib/constants';

interface SimulationStore {
  status:       SimulationStatus;
  waypoints:    Waypoint[];
  routeResult:  RouteResponse | null;
  roverState:   RoverState;
  costWeights:  CostWeights;
  error:        string | null;

  setStatus:      (s: SimulationStatus) => void;
  setWaypoint:    (type: 'start' | 'end', grid: GridNode) => void;
  setRouteResult: (r: RouteResponse | null) => void;
  setRoverState:  (rs: Partial<RoverState>) => void;
  setCostWeights: (w: Partial<CostWeights>) => void;
  setError:       (e: string | null) => void;
  reset:          () => void;
}

const defaultRover: RoverState = {
  position:     [0, 0, 0],
  rotation:     [0, 0, 0],
  pathProgress: 0,
};

export const useSimulationStore = create<SimulationStore>((set) => ({
  status:      'idle',
  waypoints:   [],
  routeResult: null,
  roverState:  defaultRover,
  costWeights: {
    slopeWeight:      DEFAULT_SLOPE_WEIGHT,
    craterRiskWeight: DEFAULT_CRATER_RISK_WEIGHT,
    elevationWeight:  DEFAULT_ELEVATION_WEIGHT,
  },
  error: null,

  setStatus:      (status)      => set({ status }),
  setWaypoint:    (type, grid)  => set((s) => {
    const existing = s.waypoints.filter(w => w.type !== type);
    return { waypoints: [...existing, { id: type, type, grid }] };
  }),
  setRouteResult: (routeResult) => set({ routeResult }),
  setRoverState:  (rs)          => set((s) => ({ roverState: { ...s.roverState, ...rs } })),
  setCostWeights: (w)           => set((s) => ({ costWeights: { ...s.costWeights, ...w } })),
  setError:       (error)       => set({ error }),
  reset:          ()            => set({
    status: 'idle', routeResult: null,
    roverState: defaultRover, error: null,
  }),
}));
