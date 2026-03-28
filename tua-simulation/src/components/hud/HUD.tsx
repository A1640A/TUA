'use client';
import Compass from './Compass';
import ApiStatusBadge from './ApiStatusBadge';

export default function HUD() {
  return (
    <>
      {/* Top center title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center select-none">
        <h1 className="text-sm font-semibold tracking-[0.3em] text-white/30 uppercase font-mono">
          TUA // Lunar Route Optimizer
        </h1>
      </div>
      {/* Bottom right: compass */}
      <div className="absolute bottom-6 right-6 pointer-events-none">
        <Compass />
      </div>
      {/* Bottom left: API badge */}
      <div className="absolute bottom-6 left-4 pointer-events-none">
        <ApiStatusBadge />
      </div>
    </>
  );
}
