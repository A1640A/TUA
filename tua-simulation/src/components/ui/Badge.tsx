'use client';
import type { SimulationStatus } from '@/types/simulation.types';

const colors: Record<SimulationStatus, string> = {
  idle:        'bg-white/10 text-white/50',
  calculating: 'bg-yellow-500/20 text-yellow-300',
  scanning:    'bg-cyan-500/20 text-cyan-300',
  animating:   'bg-sky-500/20 text-sky-300',
  rerouting:   'bg-orange-500/20 text-orange-300',
  completed:   'bg-green-500/20 text-green-300',
  error:       'bg-red-500/20 text-red-300',
};

const labels: Record<SimulationStatus, string> = {
  idle:        'Bekliyor',
  calculating: 'Hesaplıyor...',
  scanning:    'Taranıyor...',
  animating:   'Hareket Ediyor',
  rerouting:   'Yeniden Hesaplıyor',
  completed:   'Tamamlandı',
  error:       'Hata',
};

const pulsing: SimulationStatus[] = ['calculating', 'scanning', 'rerouting', 'animating'];

export default function Badge({ status }: { status: SimulationStatus }) {
  return (
    <span className={['text-xs font-semibold px-2.5 py-1 rounded-full', colors[status]].join(' ')}>
      {pulsing.includes(status) && (
        <span className="inline-block w-2 h-2 rounded-full bg-current mr-1.5 animate-pulse opacity-70" />
      )}
      {labels[status]}
    </span>
  );
}
