'use client';
import { USE_MOCK_API } from '@/lib/constants';

export default function ApiStatusBadge() {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
      <span className={[
        'w-1.5 h-1.5 rounded-full',
        USE_MOCK_API ? 'bg-yellow-400' : 'bg-green-400 animate-pulse',
      ].join(' ')} />
      <span className="text-[10px] font-mono text-white/40">
        {USE_MOCK_API ? 'MOCK' : 'C# API'}
      </span>
    </div>
  );
}
