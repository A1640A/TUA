'use client';
import { useEffect, useRef } from 'react';
import { useObstacleStore } from '@/store/obstacleStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useRouteCalculation } from './useRouteCalculation';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';

/**
 * useObstacleTrigger v2
 *
 * Fixes vs v1:
 *  1. Reroute now activates for ALL non-idle statuses
 *     ('animating', 'completed', 'scanning') — previously only 'animating'
 *     was handled, so placing an obstacle after the rover finished or during
 *     a scan did nothing.
 *
 *  2. TERRAIN_SCALE and GRID_SIZE are imported from constants (no hardcoding).
 *
 *  3. The grid-snap formula now exactly mirrors worldToGrid() in MoonTerrain.tsx,
 *     so the reroute start position is always valid.
 *
 *  4. On 'completed' or 'scanning' the rover may be at the end — we use its
 *     stored position (which is already on the terrain) as the new start.
 *
 *  5. pendingRef guards against rapid double-drop, as before.
 */
export function useObstacleTrigger() {
  const pendingRef = useRef(false);
  const { calculate } = useRouteCalculation();

  // Keep a stable ref to calculate so the subscribe callback always has the
  // latest closure (including latest obstacles/waypoints/terrain).
  const calculateRef = useRef(calculate);
  useEffect(() => { calculateRef.current = calculate; }, [calculate]);

  useEffect(() => {
    let prevCount = useObstacleStore.getState().obstacles.length;

    const unsubscribe = useObstacleStore.subscribe((state) => {
      // Only react to additions, not removals
      if (state.obstacles.length <= prevCount) {
        prevCount = state.obstacles.length;
        return;
      }
      prevCount = state.obstacles.length;

      const sim = useSimulationStore.getState();

      // ── FIXED: trigger for ANY active status, not just 'animating' ──────
      // BUG-03 FIX: 'rerouting' added — placing an obstacle while a reroute
      // is already in progress no longer silently drops the new obstacle.
      const activeStatuses: typeof sim.status[] = ['animating', 'completed', 'scanning', 'rerouting'];
      if (!activeStatuses.includes(sim.status)) return;

      // Prevent double-trigger on rapid obstacle placement
      if (pendingRef.current) return;
      pendingRef.current = true;

      // ── Snap rover world position to grid ────────────────────────────────
      // Formula must match worldToGrid() in MoonTerrain.tsx exactly:
      //   gx = round((wx / TERRAIN_SCALE + 0.5) * GRID_SIZE)
      const [rx, , rz] = sim.roverState.position;
      const newStartX = Math.max(0, Math.min(GRID_SIZE - 1,
        Math.round((rx / TERRAIN_SCALE + 0.5) * GRID_SIZE),
      ));
      const newStartZ = Math.max(0, Math.min(GRID_SIZE - 1,
        Math.round((rz / TERRAIN_SCALE + 0.5) * GRID_SIZE),
      ));

      // Stop current animation and set reroute start
      sim.setStatus('rerouting');
      sim.setWaypoint('start', { x: newStartX, z: newStartZ });

      // Short delay: allows setWaypoint to flush into Zustand before the
      // API call reads the store, and shows the HUD "Rerouting" banner.
      setTimeout(async () => {
        try {
          await calculateRef.current({ returnVisited: true });
        } finally {
          pendingRef.current = false;
        }
      }, 150);
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
