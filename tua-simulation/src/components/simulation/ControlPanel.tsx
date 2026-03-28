'use client';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CostWeightSliders from './CostWeightSliders';
import { useSimulation } from '@/hooks/useSimulation';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { RefreshCw, Play, RotateCcw, Navigation, Flag, AlertTriangle, Trash2 } from 'lucide-react';

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

  return (
    <div className="flex flex-col gap-3 w-72">
      {/* ── System Status ────────────────────────────────────────────────── */}
      <Panel title="Sistem Durumu">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">TUA Simülasyonu</p>
            <p className="text-[10px] text-white/40 font-mono mt-0.5">Tohum: {seed}</p>
          </div>
          <Badge status={status} />
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
            {error}
          </p>
        )}
      </Panel>

      {/* ── Navigation Waypoints ─────────────────────────────────────────── */}
      <Panel title="Navigasyon Noktaları">
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 font-bold text-[9px]">B</span>
            <span className="text-white/50">Başlangıç:</span>
            <span className="font-mono text-white/80 ml-auto">{startCoords}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-[9px]">H</span>
            <span className="text-white/50">Hedef:</span>
            <span className="font-mono text-white/80 ml-auto">{endCoords}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => toggleMode('start')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border transition-all ${
              placementMode === 'start'
                ? 'bg-green-500/20 border-green-500/60 text-green-300 shadow-[0_0_12px_rgba(34,197,94,0.25)]'
                : 'bg-white/4 border-white/10 text-white/50 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400'
            }`}
          >
            <Navigation size={11} />
            Başlangıç
          </button>
          <button
            onClick={() => toggleMode('end')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border transition-all ${
              placementMode === 'end'
                ? 'bg-red-500/20 border-red-500/60 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : 'bg-white/4 border-white/10 text-white/50 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
            }`}
          >
            <Flag size={11} />
            Hedef
          </button>
        </div>

        {placementMode && (
          <p className="mt-2 text-[10px] text-white/40 text-center animate-pulse">
            {placementMode === 'start' ? '🟢' : '🔴'} Haritada{' '}
            {placementMode === 'start' ? 'başlangıç' : 'hedef'} noktasını seçin
          </p>
        )}
      </Panel>

      {/* ── Obstacle Management ──────────────────────────────────────────── */}
      <Panel title="Dinamik Engeller">
        <div className="flex gap-2 mb-2">
          <button
            onClick={toggleObstaclePlacing}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border transition-all ${
              placingObstacle
                ? 'bg-orange-500/20 border-orange-500/60 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.25)] animate-pulse'
                : 'bg-white/4 border-white/10 text-white/50 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400'
            }`}
          >
            <AlertTriangle size={11} />
            {placingObstacle ? 'Haritaya Tıkla' : 'Engel Ekle'}
          </button>
          <button
            onClick={clearObstacles}
            disabled={obstacles.length === 0}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border transition-all bg-white/4 border-white/10 text-white/50 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={11} />
            Temizle
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${obstacles.length > 0 ? 'bg-orange-400 animate-pulse' : 'bg-white/20'}`} />
          <span className="text-[10px] font-mono text-white/40">
            {obstacles.length > 0 ? `${obstacles.length} aktif engel` : 'Engel yok'}
          </span>
          {obstacles.length > 0 && (
            <span className="text-[9px] text-white/25 ml-auto">Sağ tık → kaldır</span>
          )}
        </div>
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
