import { USE_MOCK_API } from '@/lib/constants';
import { apiFetch } from './apiClient';
import { mockCalculateRoute } from './mockRouteApi';
import type { RouteRequest, RouteResponse } from '../types/routeContract';

/**
 * Primary entry point for route calculation.
 * Routes to mock or real C# API based on env flag.
 */
export async function calculateRoute(req: RouteRequest): Promise<RouteResponse> {
  if (USE_MOCK_API) {
    console.info('[RouteAPI] Using mock API (NEXT_PUBLIC_USE_MOCK_API=true)');
    return mockCalculateRoute(req);
  }

  console.info('[RouteAPI] Calling C# backend:', req.startNode, '->', req.endNode);
  return apiFetch<RouteResponse>('/api/route/calculate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
