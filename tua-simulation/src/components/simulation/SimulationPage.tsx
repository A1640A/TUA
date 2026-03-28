'use client';
import dynamic from 'next/dynamic';
import ControlPanel from './ControlPanel';
import InfoPanel from './InfoPanel';
import HUD from '@/components/hud/HUD';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useObstacleTrigger } from '@/hooks/useObstacleTrigger';

// Canvas must be client-only (Three.js requires window access)
const Scene = dynamic(() => import('@/canvas/Scene'), { ssr: false });

/**
 * Root simulation page layout.
 *
 * useObstacleTrigger is called HERE (outside <Canvas>) so it runs in the
 * standard React render tree. This is critical — inside the R3F Canvas,
 * Zustand subscriptions can be throttled by the WebGL render loop, causing
 * the trigger to miss status changes or read stale values.
 */
export default function SimulationPage() {
  // Obstacle → reroute watcher lives outside Canvas for reliable Zustand access.
  useObstacleTrigger();

  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen overflow-hidden bg-[#080810]">
        {/* 3D Canvas — fullscreen background */}
        <div className="absolute inset-0">
          <Scene />
        </div>

        {/* HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <HUD />
        </div>

        {/* Left Panel — controls */}
        <div className="absolute left-4 top-12 bottom-4 flex flex-col justify-start pointer-events-auto z-10 overflow-y-auto scrollbar-hide">
          <ControlPanel />
        </div>

        {/* Right Panel — telemetry */}
        <div className="absolute right-4 top-12 bottom-4 flex flex-col justify-start pointer-events-auto z-10 overflow-y-auto scrollbar-hide">
          <InfoPanel />
        </div>
      </div>
    </ErrorBoundary>
  );
}
