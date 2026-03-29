'use client';
import dynamic from 'next/dynamic';
import ControlPanel from './ControlPanel';
import InfoPanel from './InfoPanel';
import HUD from '@/components/hud/HUD';
import SatelliteMinimap from '@/components/hud/SatelliteMinimap';
import CockpitPanel from '@/components/hud/CockpitPanel';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useObstacleTrigger } from '@/hooks/useObstacleTrigger';

const Scene = dynamic(() => import('@/canvas/Scene'), { ssr: false });

/**
 * Root simulation page — Mission Control Layout.
 *
 * Right column (right: 4px) — tek sütun, tamamen sağa yaslı:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  CockpitPanel  (320px × ~250px)         │ ← üst, kaydırılabilir
 *   ├─────────────────────────────────────────┤
 *   │  SatelliteMinimap (~210px)              │
 *   ├─────────────────────────────────────────┤
 *   │  InfoPanel (w-80 = 320px)               │ ← alt, sağa yapışık
 *   └─────────────────────────────────────────┘
 *
 * Tüm sağ panel elemanları tek bir absolute sütun içinde,
 * right: OUTER_GAP ile sağ kenara hizalanmış.
 */

/** Outer margin from right edge. */
const OUTER_GAP = 4;

export default function SimulationPage() {
  useObstacleTrigger();

  return (
    <ErrorBoundary>
      <div className="relative w-full h-screen overflow-hidden bg-[#080810]">

        {/* 3D Canvas */}
        <div className="absolute inset-0">
          <Scene />
        </div>

        {/* HUD overlay */}
        <div className="absolute inset-0 pointer-events-none">
          <HUD />
        </div>

        {/* Left Panel */}
        <div className="absolute left-4 top-12 bottom-4 flex flex-col justify-start pointer-events-auto z-10 overflow-y-auto scrollbar-hide">
          <ControlPanel />
        </div>

        {/*
         * ── Right Column — tek sütun, tam sağa yaslı ────────────────────
         * CockpitPanel + SatelliteMinimap + InfoPanel hepsi burada,
         * right: OUTER_GAP ile sağ kenara yapışık, top-down sıralanmış.
         */}
        <div
          className="absolute pointer-events-auto z-20 overflow-y-auto scrollbar-hide"
          style={{
            right:         OUTER_GAP,
            top:           48,   // HUD header altı (~top-12)
            bottom:        OUTER_GAP,
            display:       'flex',
            flexDirection: 'column',
            alignItems:    'flex-end',
            gap:           10,
          }}
        >
          {/* Rover takip — kuşbakışı */}
          <CockpitPanel />

          {/* Uydu haritası — radar */}
          <SatelliteMinimap />

          {/* Görev bilgileri — telemetri + bağlantı + kılavuz */}
          <InfoPanel />
        </div>

      </div>
    </ErrorBoundary>
  );
}
