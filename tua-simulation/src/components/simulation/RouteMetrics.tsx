'use client';
import { useSimulationStore } from '@/store/simulationStore';

function TelemetryRow({ label, value, unit, accent }: {
  label: string; value: string; unit?: string; accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/8 last:border-0">
      <span className="text-[11px] text-white/55 font-mono uppercase tracking-[0.1em]">
        {label}
      </span>
      <span className={`text-[13px] font-mono font-bold tabular-nums ${accent ? 'text-cyan-300' : 'text-white/90'}`}>
        {value}
        {unit && <span className="text-white/40 ml-1 text-[10px] font-normal">{unit}</span>}
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
      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <span className="text-[11px] text-white/55 font-mono uppercase tracking-[0.1em]">İlerleme</span>
          <span className="text-[12px] font-mono font-bold text-cyan-300 tabular-nums">{progressPct}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: progressWidth,
              background: 'linear-gradient(90deg, #00d4ff, #a78bfa)',
              boxShadow: '0 0 10px rgba(0,212,255,0.5)',
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
        <p className="text-[11px] text-white/35 text-center py-3 font-mono">
          Rota henüz hesaplanmadı
        </p>
      )}

      {/* Live telemetry separator */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <span className="text-[10px] font-mono font-semibold text-white/40 uppercase tracking-[0.18em]">
          Canlı Telemetri
        </span>
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
