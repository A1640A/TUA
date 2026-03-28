'use client';
import dynamic from 'next/dynamic';
import ControlPanel from './ControlPanel';
import InfoPanel from './InfoPanel';
import HUD from '@/components/hud/HUD';

// Canvas import SSR'dan kaçındırılmalı (Three.js window erişimi gerektirir)
const Scene = dynamic(() => import('@/canvas/Scene'), { ssr: false });

export default function SimulationPage() {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#080810]">
      {/* 3D Canvas  tam ekran arka plan */}
      <div className="absolute inset-0">
        <Scene />
      </div>

      {/* HUD Overlay */}
      <div className="absolute inset-0 pointer-events-none">
        <HUD />
      </div>

      {/* Sol Panel */}
      <div className="absolute left-4 top-4 bottom-4 flex flex-col justify-start pointer-events-auto z-10 overflow-y-auto scrollbar-hide">
        <ControlPanel />
      </div>

      {/* Sağ Panel */}
      <div className="absolute right-4 top-4 bottom-4 flex flex-col justify-start pointer-events-auto z-10 overflow-y-auto scrollbar-hide">
        <InfoPanel />
      </div>
    </div>
  );
}
