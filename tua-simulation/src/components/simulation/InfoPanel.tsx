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
    <div className="flex flex-col gap-3 w-80">
      <Panel title="Görev Telemetrisi">
        <RouteMetrics />
      </Panel>

      <Panel title="Bağlantı Durumu">
        <div className="flex items-center gap-2.5">
          <span className={[
            'w-2.5 h-2.5 rounded-full shrink-0',
            USE_MOCK_API ? 'bg-yellow-400' : 'bg-green-400 animate-pulse',
          ].join(' ')} />
          <span className="text-[13px] text-white/75 font-medium">
            {USE_MOCK_API ? 'Mock Modu (İstemci Taraflı)' : 'C# API Bağlandı'}
          </span>
        </div>
        {!USE_MOCK_API && (
          <p className="mt-1.5 text-[11px] font-mono text-white/35 break-all pl-5">
            {process.env.NEXT_PUBLIC_API_URL}
          </p>
        )}
      </Panel>

      <Panel title="Kullanım Kılavuzu">
        <ul className="space-y-3">
          {[
            { num: '01', color: 'text-cyan-400',   text: 'Başlangıç ve hedef noktasını haritaya tıklayarak belirle' },
            { num: '02', color: 'text-cyan-400',   text: 'A* maliyet ağırlıklarını senaryona göre ayarla' },
            { num: '03', color: 'text-cyan-400',   text: '"Rotayı Hesapla" butonuna bas', bold: true },
            { num: '04', color: 'text-cyan-400',   text: 'Rover animasyonunu ve tarama görselini izle' },
            { num: '05', color: 'text-orange-400', text: 'Engel ekle → hareket eden rover rotayı yeniden hesaplar', highlight: true },
            { num: '06', color: 'text-white/40',   text: 'Sağ tıkla engeli kaldır' },
          ].map(({ num, color, text, bold, highlight }) => (
            <li key={num} className="flex gap-3 items-start">
              <span className={`${color} font-mono font-bold text-[13px] shrink-0 mt-px`}>{num}</span>
              <span className={`text-[13px] leading-[1.5] ${highlight ? 'text-white/80' : 'text-white/60'} ${bold ? 'font-medium' : ''}`}>
                {bold ? <strong className="text-white/85 font-semibold">{text}</strong> : text}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
