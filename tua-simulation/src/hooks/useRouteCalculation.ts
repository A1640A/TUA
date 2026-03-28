'use client';
import { useCallback } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { calculateRoute } from '@/services/api/routeApi';
import { buildRouteRequest } from '@/services/terrain/terrainSerializer';

export function useRouteCalculation() {
  const { waypoints, costWeights, setStatus, setRouteResult, setError } = useSimulationStore();
  const { terrain } = useTerrainStore();

  const calculate = useCallback(async () => {
    const start = waypoints.find(w => w.type === 'start');
    const end   = waypoints.find(w => w.type === 'end');

    if (!start || !end) { setError('Başlangıç ve bitiş noktası seçin.'); return; }
    if (!terrain)        { setError('Arazi verisi henüz hazır değil.');   return; }

    setStatus('calculating');
    setError(null);

    try {
      const request  = buildRouteRequest(terrain, start.grid, end.grid, costWeights);
      const response = await calculateRoute(request);

      if (!response.success) throw new Error(response.error ?? 'Rota hesaplanamadı');

      setRouteResult(response);
      setStatus('animating');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setError(msg);
      setStatus('error');
    }
  }, [waypoints, terrain, costWeights, setStatus, setRouteResult, setError]);

  return { calculate };
}
