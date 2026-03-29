'use client';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CostWeightSliders from './CostWeightSliders';
import { useSimulation } from '@/hooks/useSimulation';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import type { Obstacle } from '@/types/simulation.types';
import { RefreshCw, Play, RotateCcw, Navigation, Flag, Trash2, MousePointerClick } from 'lucide-react';

// ── Obstacle palette definition ───────────────────────────────────────────────
const OBSTACLE_PALETTE: {
  variant:  Obstacle['variant'];
  label:    string;
  emoji:    string;
  desc:     string;
  color:    string;
  selected: string;
}[] = [
  { variant: 'boulder-sm',  label: 'Küçük Taş',   emoji: '🪨', desc: 'Küçük keskin kaya',       color: 'hover:border-stone-400/40  hover:bg-stone-400/10  hover:text-stone-200',  selected: 'border-stone-400/70  bg-stone-400/20  text-stone-200' },
  { variant: 'boulder-md',  label: 'Orta Kaya',   emoji: '🗿', desc: 'Orta boy kayalık',        color: 'hover:border-amber-500/40  hover:bg-amber-500/10  hover:text-amber-200',  selected: 'border-amber-500/70  bg-amber-500/20  text-amber-200' },
  { variant: 'boulder-lg',  label: 'Büyük Kaya',  emoji: '⛰️', desc: 'Büyük kaya kütlesi',      color: 'hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-200', selected: 'border-orange-500/70 bg-orange-500/20 text-orange-200' },
  { variant: 'crater',      label: 'Krater',      emoji: '⭕', desc: 'Çarpma krateri',          color: 'hover:border-red-500/40    hover:bg-red-500/10    hover:text-red-200',    selected: 'border-red-500/70    bg-red-500/20    text-red-200' },
  { variant: 'dust-mound',  label: 'Toz Tepesi',  emoji: '🏔️', desc: 'Regolith tümsek',        color: 'hover:border-yellow-500/40 hover:bg-yellow-500/10 hover:text-yellow-200', selected: 'border-yellow-500/70 bg-yellow-500/20 text-yellow-200' },
  { variant: 'antenna',     label: 'Enkaz',       emoji: '📡', desc: 'Çökmüş uydu enkazı',     color: 'hover:border-cyan-500/40   hover:bg-cyan-500/10   hover:text-cyan-200',   selected: 'border-cyan-500/70   bg-cyan-500/20   text-cyan-200' },
];

/**
 * Left-side control panel providing:
 * - Mission status overview
 * - Waypoint placement mode toggle
 * - Obstacle management (place, clear, count)
 * - A* cost weight sliders
 * - Route calculation + terrain actions
 */
export default function ControlPanel() {
  const {
    status, waypoints, error,
    startSimulation, regenerateTerrain, reset,
  } = useSimulation();

  const placementMode    = useSimulationStore(s => s.placementMode);
  const setPlacementMode = useSimulationStore(s => s.setPlacementMode);
  const seed = useTerrainStore(s => s.config.seed);

  const placingObstacle    = useObstacleStore(s => s.placingObstacle);
  const setPlacingObstacle = useObstacleStore(s => s.setPlacingObstacle);
  const obstacles          = useObstacleStore(s => s.obstacles);
  const clearObstacles     = useObstacleStore(s => s.clearObstacles);
  const selectedVariant    = useObstacleStore(s => s.selectedVariant);
  const setSelectedVariant = useObstacleStore(s => s.setSelectedVariant);

  const startWp = waypoints.find(w => w.type === 'start');
  const endWp   = waypoints.find(w => w.type === 'end');

  const startCoords = startWp ? `(${startWp.grid.x}, ${startWp.grid.z})` : '—';
  const endCoords   = endWp   ? `(${endWp.grid.x}, ${endWp.grid.z})`     : '—';

  const toggleMode = (mode: 'start' | 'end') =>
    setPlacementMode(placementMode === mode ? null : mode);

  const toggleObstaclePlacing = () => {
    setPlacingObstacle(!placingObstacle);
    setPlacementMode(null);
  };

  const selectAndPlace = (variant: Obstacle['variant']) => {
    setSelectedVariant(variant);
    setPlacingObstacle(true);
    setPlacementMode(null);
  };

  return (
    <div className="flex flex-col gap-3 w-80">
      {/* ── System Status ────────────────────────────────────────────────── */}
      <Panel title="Sistem Durumu">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[15px] font-bold text-white leading-tight">TUA Simülasyonu</p>
            <p className="text-[12px] text-white/55 font-mono mt-1">Tohum: {seed}</p>
          </div>
          <Badge status={status} />
        </div>
        {error && (
          <p className="mt-2 text-[13px] text-red-300 bg-red-500/12 rounded-lg px-3 py-2 border border-red-500/25">
            {error}
          </p>
        )}
      </Panel>

      {/* ── Navigation Waypoints ─────────────────────────────────────────── */}
      <Panel title="Navigasyon Noktaları">
        <div className="space-y-2.5 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-green-500/25 border border-green-500/50 flex items-center justify-center text-green-300 font-bold text-[11px]">B</span>
            <span className="text-[13px] text-white/65 font-medium">Başlangıç:</span>
            <span className="font-mono text-[14px] font-bold text-white/95 ml-auto">{startCoords}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-full bg-red-500/25 border border-red-500/50 flex items-center justify-center text-red-300 font-bold text-[11px]">H</span>
            <span className="text-[13px] text-white/65 font-medium">Hedef:</span>
            <span className="font-mono text-[14px] font-bold text-white/95 ml-auto">{endCoords}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => toggleMode('start')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold py-2.5 px-3 rounded-lg border transition-all ${
              placementMode === 'start'
                ? 'bg-green-500/20 border-green-500/60 text-green-300 shadow-[0_0_12px_rgba(34,197,94,0.25)]'
                : 'bg-white/4 border-white/10 text-white/65 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400'
            }`}
          >
            <Navigation size={12} />
            Başlangıç
          </button>
          <button
            onClick={() => toggleMode('end')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold py-2.5 px-3 rounded-lg border transition-all ${
              placementMode === 'end'
                ? 'bg-red-500/20 border-red-500/60 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : 'bg-white/4 border-white/10 text-white/65 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
            }`}
          >
            <Flag size={12} />
            Hedef
          </button>
        </div>

        {placementMode && (
          <p className="mt-2.5 text-[12px] text-white/60 text-center animate-pulse">
            {placementMode === 'start' ? '🟢' : '🔴'} Haritada{' '}
            {placementMode === 'start' ? 'başlangıç' : 'hedef'} noktasını seçin
          </p>
        )}
      </Panel>

      {/* ── Obstacle Palette ──────────────────────────────────────────────── */}
      <Panel title="Dinamik Engeller">
        {/* 3×2 variant grid */}
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {OBSTACLE_PALETTE.map(({ variant, label, emoji, desc, color, selected }) => {
            const isSelected = selectedVariant === variant;
            return (
              <button
                key={variant}
                title={desc}
                onClick={() => setSelectedVariant(variant)}
                className={[
                  'flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-all duration-150',
                  'bg-white/3',
                  isSelected ? selected : `border-white/10 text-white/40 ${color}`,
                  isSelected ? 'shadow-[0_0_10px_rgba(255,255,255,0.08)]' : '',
                ].join(' ')}
              >
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="text-[11px] font-mono font-semibold leading-tight">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Place + Clear row */}
        <div className="flex gap-2 mb-2">
          <button
            onClick={toggleObstaclePlacing}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold py-2.5 px-3 rounded-lg border transition-all ${
              placingObstacle
                ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.25)] animate-pulse'
                : 'bg-white/4 border-white/10 text-white/50 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400'
            }`}
          >
            <MousePointerClick size={11} />
            {placingObstacle ? 'Haritaya tıkla…' : 'Yerleştir'}
          </button>
          <button
            onClick={clearObstacles}
            disabled={obstacles.length === 0}
            className="flex items-center justify-center gap-1.5 text-[13px] font-semibold py-2.5 px-3 rounded-lg border transition-all bg-white/4 border-white/10 text-white/50 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={11} />
            Temizle
          </button>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${obstacles.length > 0 ? 'bg-orange-400 animate-pulse' : 'bg-white/25'}`} />
          <span className="text-[12px] font-mono text-white/60">
            {obstacles.length > 0 ? `${obstacles.length} aktif engel` : 'Engel yok'}
          </span>
          {obstacles.length > 0 && (
            <span className="text-[11px] text-white/40 ml-auto">Sağ tık → kaldır</span>
          )}
        </div>

        {/* Placement hint */}
        {placingObstacle && (
          <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5">
            <span className="text-lg leading-none">
              {OBSTACLE_PALETTE.find(p => p.variant === selectedVariant)?.emoji}
            </span>
            <p className="text-[12px] text-orange-300 font-mono">
              {OBSTACLE_PALETTE.find(p => p.variant === selectedVariant)?.label} seçildi — haritaya tıkla
            </p>
          </div>
        )}
      </Panel>


      {/* ── A* Cost Weights ──────────────────────────────────────────────── */}
      <Panel title="A* Maliyet Ağırlıkları">
        <CostWeightSliders />
      </Panel>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full justify-center"
            onClick={startSimulation}
            loading={status === 'calculating' || status === 'scanning'}
            disabled={!startWp || !endWp}
          >
            <Play size={14} />
            {status === 'rerouting' ? 'Yeniden Hesapla' : 'Rotayı Hesapla'}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1 justify-center" onClick={regenerateTerrain}>
              <RefreshCw size={12} /> Yeni Arazi
            </Button>
            <Button variant="ghost" size="sm" className="flex-1 justify-center" onClick={reset}>
              <RotateCcw size={12} /> Sıfırla
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
