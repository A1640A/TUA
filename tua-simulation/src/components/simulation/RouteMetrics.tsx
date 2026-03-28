'use client';
import { useSimulationStore } from '@/store/simulationStore';

function TelemetryRow({ label, value, unit, accent }: {
  label: string; value: string; unit?: string; accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[10px] text-white/40 font-mono uppercase tracking-[0.08em]">{label}</span>
      <span className={`text-xs font-mono tabular-nums ${accent ? 'text-cyan-400' : 'text-white/80'}`}>
        {value}
        {unit && <span className="text-white/30 ml-1 text-[9px]">{unit}</span>}
      </span>
    </div>
  );
}

/**
 * Mission telemetry readout panel displayed on the right side.
 * Shows route statistics and live rover state (speed, heading, elevation).
 */
export default function RouteMetrics() {
  const result     = useSimulationStore(s => s.routeResult);
  const roverState = useSimulationStore(s => s.roverState);
  const status     = useSimulationStore(s => s.status);

  const progressPct   = (roverState.pathProgress * 100).toFixed(1);
  const progressWidth = `${progressPct}%`;

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-[10px] text-white/40 font-mono uppercase tracking-[0.08em]">İlerleme</span>
          <span className="text-[10px] font-mono text-cyan-400 tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: progressWidth,
              background: 'linear-gradient(90deg, #00d4ff, #a78bfa)',
              boxShadow: '0 0 8px rgba(0,212,255,0.5)',
            }}
          />
        </div>
      </div>

      {/* Route statistics */}
      {result ? (
        <>
          <TelemetryRow label="Toplam Maliyet" value={result.totalCost.toFixed(2)} accent />
          <TelemetryRow label="Adım Sayısı"    value={result.stepCount.toString()} />
          <TelemetryRow label="Hesaplama"       value={result.elapsedMs.toString()} unit="ms" />
          <TelemetryRow label="Tahmini Süre"    value={(result.totalCost * 8).toFixed(0)} unit="s" />
          {result.visitedNodes?.length > 0 && (
            <TelemetryRow label="Taranan Hücre" value={result.visitedNodes.length.toString()} accent />
          )}
        </>
      ) : (
        <p className="text-[10px] text-white/25 text-center py-2 font-mono">Rota hesaplanmadı</p>
      )}

      {/* Live telemetry separator */}
      <div className="mt-3 pt-3 border-t border-white/8">
        <span className="text-[9px] font-mono text-white/25 uppercase tracking-[0.15em]">Canlı Telemetri</span>
        <div className="mt-2">
          <TelemetryRow
            label="Hız" 
            value={status === 'animating' ? roverState.speed.toFixed(2) : '0.00'}
            unit="ü/s"
          />
          <TelemetryRow
            label="İstikamet"
            value={status === 'animating' ? `${Math.round(roverState.heading)}` : '---'}
            unit="°"
          />
          <TelemetryRow
            label="Yükseklik"
            value={status === 'animating' ? roverState.elevation.toFixed(2) : '---'}
            unit="ü"
          />
        </div>
      </div>
    </div>
  );
}
