'use client';
const colors = {
  idle:        'bg-white/10 text-white/50',
  calculating: 'bg-yellow-500/20 text-yellow-300',
  animating:   'bg-sky-500/20 text-sky-300',
  completed:   'bg-green-500/20 text-green-300',
  error:       'bg-red-500/20 text-red-300',
};
const labels = {
  idle:        'Bekliyor',
  calculating: 'Hesaplıyor...',
  animating:   'Hareket Ediyor',
  completed:   'Tamamlandı',
  error:       'Hata',
};

export default function Badge({ status }: { status: keyof typeof colors }) {
  return (
    <span className={['text-xs font-semibold px-2.5 py-1 rounded-full', colors[status]].join(' ')}>
      {status === 'calculating' && (
        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5 animate-pulse" />
      )}
      {labels[status]}
    </span>
  );
}
