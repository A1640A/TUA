'use client';
import { useCallback, useRef } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { calculateRoute } from '@/services/api/routeApi';
import { buildRouteRequest } from '@/services/terrain/terrainSerializer';

/**
 * Encapsulates all logic for calling the C# A* route API.
 *
 * The returned `calculate` function is intentionally stabilised via useRef so
 * that hooks depending on it (e.g. useObstacleTrigger) do not trigger on every
 * obstacle-add re-render. The ref always points to the latest closure, so all
 * store values (waypoints, obstacles, terrain, costWeights) are current at the
 * time calculate() is actually invoked.
 *
 * @returns `{ calculate }` — async function that fires the API call.
 */
export function useRouteCalculation() {
  const { waypoints, costWeights, setStatus, setRouteResult, setError, setVisitedNodes, startMissionClock } =
    useSimulationStore();
  const { terrain }   = useTerrainStore();
  const { obstacles } = useObstacleStore();

  // Keep the latest closure in a ref so the stable callback below always has
  // access to current values without needing to be re-created on every change.
  const latestRef = useRef({ waypoints, terrain, costWeights, obstacles,
    setStatus, setRouteResult, setError, setVisitedNodes, startMissionClock });
  latestRef.current = { waypoints, terrain, costWeights, obstacles,
    setStatus, setRouteResult, setError, setVisitedNodes, startMissionClock };

  // Stable reference — never changes between renders.
  // Reads everything from latestRef.current at invocation time.
  const calculate = useCallback(async (options: { returnVisited?: boolean } = {}) => {
    const {
      terrain, costWeights, obstacles,
      setStatus, setRouteResult, setError, setVisitedNodes, startMissionClock,
    } = latestRef.current;

    // Read waypoints imperatively at call-time — NOT from latestRef snapshot.
    // This guarantees useObstacleTrigger's setWaypoint('start', roverPos) call
    // is always visible here, even if latestRef was last updated before the
    // setWaypoint dispatch completed.
    const { waypoints } = useSimulationStore.getState();

    const start = waypoints.find(w => w.type === 'start');
    const end   = waypoints.find(w => w.type === 'end');

    if (!start || !end) { setError('Başlangıç ve bitiş noktası seçin.');  return; }
    if (!terrain)        { setError('Arazi verisi henüz hazır değil.');    return; }

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
      setStatus(response.visitedNodes?.length ? 'scanning' : 'animating');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setError(msg);
      setStatus('error');
    }
  // Stable: empty deps — all values read from latestRef.current inside.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { calculate };
}
