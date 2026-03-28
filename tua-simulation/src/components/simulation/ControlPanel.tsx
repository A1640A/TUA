'use client';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CostWeightSliders from './CostWeightSliders';
import { useSimulation } from '@/hooks/useSimulation';
import { useTerrainStore } from '@/store/terrainStore';
import { useSimulationStore } from '@/store/simulationStore';
import { RefreshCw, Play, RotateCcw, Navigation, Flag } from 'lucide-react';

export default function ControlPanel() {
  const {
    status, waypoints, error,
    startSimulation, regenerateTerrain, reset,
  } = useSimulation();

  const placementMode    = useSimulationStore(s => s.placementMode);
  const setPlacementMode = useSimulationStore(s => s.setPlacementMode);
  const seed = useTerrainStore(s => s.config.seed);

  const startWp = waypoints.find(w => w.type === 'start');
  const endWp   = waypoints.find(w => w.type === 'end');

  const startCoords = startWp ? `(${startWp.grid.x}, ${startWp.grid.z})` : '—';
  const endCoords   = endWp   ? `(${endWp.grid.x}, ${endWp.grid.z})`     : '—';

  const toggleMode = (mode: 'start' | 'end') =>
    setPlacementMode(placementMode === mode ? null : mode);

  return (
    <div className="flex flex-col gap-3 w-72">
      {/* Header */}
      <Panel title="Sistem Durumu">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">TUA Simülasyonu</p>
            <p className="text-xs text-white/40 font-mono mt-0.5">Tohum: {seed}</p>
          </div>
          <Badge status={status} />
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </Panel>

      {/* Waypoints */}
      <Panel title="Navigasyon Noktaları">
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center text-green-400 font-bold text-[10px]">S</span>
            <span className="text-white/60">Başlangıç:</span>
            <span className="font-mono text-white/80">{startCoords}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 font-bold text-[10px]">E</span>
            <span className="text-white/60">Bitiş:</span>
            <span className="font-mono text-white/80">{endCoords}</span>
          </div>
        </div>

        {/* Placement mode toggle buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => toggleMode('start')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border transition-all ${
              placementMode === 'start'
                ? 'bg-green-500/25 border-green-500/70 text-green-300 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
                : 'bg-white/5 border-white/10 text-white/50 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400'
            }`}
          >
            <Navigation size={11} />
            Başlangıç
          </button>
          <button
            onClick={() => toggleMode('end')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-lg border transition-all ${
              placementMode === 'end'
                ? 'bg-red-500/25 border-red-500/70 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                : 'bg-white/5 border-white/10 text-white/50 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400'
            }`}
          >
            <Flag size={11} />
            Bitiş
          </button>
        </div>

        {placementMode && (
          <p className="mt-2 text-[10px] text-white/40 text-center animate-pulse">
            {placementMode === 'start' ? '🟢' : '🔴'} Haritaya tıklayarak {placementMode === 'start' ? 'başlangıç' : 'bitiş'} noktasını belirleyin
          </p>
        )}
      </Panel>

      {/* Cost Weights */}
      <Panel title="A* Maliyet Ağırlıkları">
        <CostWeightSliders />
      </Panel>

      {/* Actions */}
      <Panel>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full justify-center"
            onClick={startSimulation}
            loading={status === 'calculating'}
            disabled={!startWp || !endWp}
          >
            <Play size={14} /> Rotayı Hesapla
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
