'use client';
import { useSimulationStore } from '@/store/simulationStore';

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/50">{label}</span>
      <span className="text-xs font-mono text-white tabular-nums">{value}</span>
    </div>
  );
}

export default function RouteMetrics() {
  const result = useSimulationStore(s => s.routeResult);
  const roverState = useSimulationStore(s => s.roverState);

  if (!result) return (
    <p className="text-xs text-white/30 text-center py-4">Rota henüz hesaplanmadı</p>
  );

  const estimatedTimeSec = (result.totalCost * 8).toFixed(0);
  const progressPct = (roverState.pathProgress * 100).toFixed(1);
  const progressWidth = `${progressPct}%`;

  return (
    <div>
      <MetricRow label="Toplam Maliyet" value={result.totalCost.toFixed(2)} />
      <MetricRow label="Adım Sayısı"    value={result.stepCount.toString()} />
      <MetricRow label="Hesaplama"       value={`${result.elapsedMs} ms`} />
      <MetricRow label="Tahmini Süre"    value={`~${estimatedTimeSec} s`} />
      <MetricRow label="İlerleme"        value={`${progressPct}%`} />
      <div className="mt-3">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-500 to-violet-500 rounded-full transition-all duration-100"
            style={{ width: progressWidth }}
          />
        </div>
      </div>
    </div>
  );
}
