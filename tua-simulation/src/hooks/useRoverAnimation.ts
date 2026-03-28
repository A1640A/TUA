'use client';
import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { ROVER_SPEED, TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE } from '@/lib/constants';
import { GRID_SIZE } from '@/lib/constants';

export function useRoverAnimation(curve: THREE.CatmullRomCurve3 | null) {
  const progressRef = useRef(0);
  const { setRoverState, setStatus, status } = useSimulationStore();

  const animate = useCallback(() => {
    if (!curve || status !== 'animating') return;
    progressRef.current = Math.min(progressRef.current + ROVER_SPEED / curve.getLength(), 1);

    const pos = curve.getPoint(progressRef.current);
    const tan = curve.getTangent(progressRef.current);
    const angle = Math.atan2(tan.x, tan.z);

    setRoverState({
      position:     [pos.x, pos.y + 0.3, pos.z],
      rotation:     [0, angle, 0],
      pathProgress: progressRef.current,
    });

    if (progressRef.current >= 1) {
      setStatus('completed');
      progressRef.current = 0;
    }
  }, [curve, status, setRoverState, setStatus]);

  const reset = useCallback(() => { progressRef.current = 0; }, []);

  return { animate, reset };
}

/** Convert API RoutePoints to Three.js world-space Vector3 array */
export function routePointsToVectors(
  points: { x: number; z: number; y: number }[],
  gridSize: number = GRID_SIZE,
  terrainScale: number = TERRAIN_SCALE,
  heightScale: number = TERRAIN_HEIGHT_SCALE
): THREE.Vector3[] {
  return points.map(p => {
    const wx = (p.x / gridSize - 0.5) * terrainScale;
    const wz = (p.z / gridSize - 0.5) * terrainScale;
    const wy = p.y * heightScale;
    return new THREE.Vector3(wx, wy, wz);
  });
}
