'use client';
import { useCallback } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { calculateRoute } from '@/services/api/routeApi';
import { buildRouteRequest } from '@/services/terrain/terrainSerializer';

/**
 * Encapsulates all logic for calling the C# A* route API.
 *
 * Supports both initial calculation and mid-drive reroutes triggered by
 * obstacle placement. When `returnVisited` is true (reroute path), the
 * response `visitedNodes` array is stored in the simulation store for
 * the real-time scan-animation overlay.
 *
 * @returns `{ calculate }` — async function that fires the API call.
 */
export function useRouteCalculation() {
  const { waypoints, costWeights, setStatus, setRouteResult, setError, setVisitedNodes, startMissionClock } =
    useSimulationStore();
  const { terrain } = useTerrainStore();
  const { obstacles } = useObstacleStore();

  const calculate = useCallback(async (options: { returnVisited?: boolean } = {}) => {
    const start = waypoints.find(w => w.type === 'start');
    const end   = waypoints.find(w => w.type === 'end');

    if (!start || !end) { setError('Başlangıç ve bitiş noktası seçin.');   return; }
    if (!terrain)        { setError('Arazi verisi henüz hazır değil.');     return; }

    setStatus('calculating');
    setError(null);

    try {
      const request  = buildRouteRequest(
        terrain, start.grid, end.grid, costWeights,
        obstacles, options.returnVisited ?? false,
      );
      const response = await calculateRoute(request);

      // Store visited nodes for scan animation (even if path failed).
      if (response.visitedNodes?.length) {
        setVisitedNodes(response.visitedNodes);
      }

      if (!response.success) {
        throw new Error(
          response.isUnreachable
            ? 'Hedef noktasına ulaşılamıyor: tüm yollar engellendi.'
            : (response.error ?? 'Rota hesaplanamadı'),
        );
      }

      startMissionClock();
      setRouteResult(response);
      // If visited nodes were returned, play scan animation first, then animate.
      setStatus(response.visitedNodes?.length ? 'scanning' : 'animating');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setError(msg);
      setStatus('error');
    }
  }, [waypoints, terrain, costWeights, obstacles, setStatus, setRouteResult, setError, setVisitedNodes, startMissionClock]);

  return { calculate };
}
