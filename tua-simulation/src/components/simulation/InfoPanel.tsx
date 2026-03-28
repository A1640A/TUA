'use client';
import Panel from '@/components/ui/Panel';
import RouteMetrics from './RouteMetrics';
import { USE_MOCK_API } from '@/lib/constants';

export default function InfoPanel() {
  return (
    <div className="flex flex-col gap-3 w-64">
      <Panel title="Rota Metrikleri">
        <RouteMetrics />
      </Panel>
      <Panel title="API Bağlantısı">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={[
              'w-2 h-2 rounded-full',
              USE_MOCK_API ? 'bg-yellow-400' : 'bg-green-400 animate-pulse',
            ].join(' ')} />
            <span className="text-xs text-white/60">
              {USE_MOCK_API ? 'Mock Mod (client-side)' : 'C# API Bağlı'}
            </span>
          </div>
          {!USE_MOCK_API && (
            <p className="text-xs font-mono text-white/30 break-all">
              {process.env.NEXT_PUBLIC_API_URL}
            </p>
          )}
        </div>
      </Panel>
      <Panel title="Kılavuz">
        <ul className="space-y-2 text-xs text-white/50">
          <li className="flex gap-2"><span className="text-sky-400">1.</span> Varsayılan noktaları ayarla</li>
          <li className="flex gap-2"><span className="text-sky-400">2.</span> A* ağırlıklarını ayarla</li>
          <li className="flex gap-2"><span className="text-sky-400">3.</span> Rotayı hesapla</li>
          <li className="flex gap-2"><span className="text-sky-400">4.</span> Rover animasyonunu izle</li>
          <li className="flex gap-2"><span className="text-sky-400">5.</span> Farklı ağırlıklarla karşılaştır</li>
        </ul>
      </Panel>
    </div>
  );
}
