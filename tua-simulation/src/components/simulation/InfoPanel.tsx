'use client';
import Panel from '@/components/ui/Panel';
import RouteMetrics from './RouteMetrics';
import { USE_MOCK_API } from '@/lib/constants';

/**
 * Right-side information panel.
 * Shows mission telemetry (RouteMetrics), connection status, and usage guide.
 */
export default function InfoPanel() {
  return (
    <div className="flex flex-col gap-3 w-64">
      <Panel title="Görev Telemetrisi">
        <RouteMetrics />
      </Panel>

      <Panel title="Bağlantı Durumu">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={[
              'w-2 h-2 rounded-full',
              USE_MOCK_API ? 'bg-yellow-400' : 'bg-green-400 animate-pulse',
            ].join(' ')} />
            <span className="text-xs text-white/60">
              {USE_MOCK_API ? 'Mock Modu (İstemci taraflı)' : 'C# API Bağlandı'}
            </span>
          </div>
          {!USE_MOCK_API && (
            <p className="text-[10px] font-mono text-white/25 break-all">
              {process.env.NEXT_PUBLIC_API_URL}
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Kullanım Kılavuzu">
        <ul className="space-y-2.5 text-[11px] text-white/45">
          <li className="flex gap-2.5"><span className="text-cyan-400 font-mono font-bold shrink-0">01</span>Başlangıç ve hedef noktasını haritaya tıklayarak belirle</li>
          <li className="flex gap-2.5"><span className="text-cyan-400 font-mono font-bold shrink-0">02</span>A* maliyet ağırlıklarını senaryona göre ayarla</li>
          <li className="flex gap-2.5"><span className="text-cyan-400 font-mono font-bold shrink-0">03</span><strong className="text-white/60">"Rotayı Hesapla"</strong> butonuna bas</li>
          <li className="flex gap-2.5"><span className="text-cyan-400 font-mono font-bold shrink-0">04</span>Rover animasyonunu ve tarama görselini izle</li>
          <li className="flex gap-2.5"><span className="text-orange-400 font-mono font-bold shrink-0">05</span><strong className="text-white/60">Engel ekle</strong> → hareket eden rover rota yeniden hesaplar</li>
          <li className="flex gap-2.5"><span className="text-white/30 font-mono font-bold shrink-0">06</span>Sağ tık ile engeli kaldır</li>
        </ul>
      </Panel>
    </div>
  );
}
