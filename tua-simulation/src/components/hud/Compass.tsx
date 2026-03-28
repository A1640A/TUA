'use client';
import { useSimulationStore } from '@/store/simulationStore';

/**
 * Compass that tracks the rover's actual heading azimuth (degrees, clockwise from North).
 * When the rover is idle/completed, shows a static cardinal orientation.
 */
export default function Compass() {
  const heading = useSimulationStore(s => s.roverState.heading);
  const status  = useSimulationStore(s => s.status);

  const needleRotation = status === 'animating' ? -heading : 0;

  return (
    <div
      className="w-16 h-16 relative rounded-full flex items-center justify-center"
      style={{
        background: 'rgba(8,8,16,0.7)',
        border: '1px solid rgba(0,212,255,0.2)',
        boxShadow: '0 0 20px rgba(0,212,255,0.08), inset 0 0 12px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Cardinal letters */}
      {(['N','S','E','W'] as const).map((dir, i) => {
        const angle  = i * 90 * (Math.PI / 180);
        const offset = 22;
        const x = Math.sin(angle) * offset;
        const y = -Math.cos(angle) * offset;
        const isNorth = dir === 'N';
        return (
          <span
            key={dir}
            className="absolute text-[8px] font-mono font-bold"
            style={{
              transform: `translate(${x}px, ${y}px)`,
              color: isNorth ? '#00d4ff' : 'rgba(255,255,255,0.25)',
            }}
          >
            {dir}
          </span>
        );
      })}

      {/* Rotating needle group */}
      <div
        className="w-10 h-10 relative"
        style={{ transform: `rotate(${needleRotation}deg)`, transition: 'transform 0.15s linear' }}
      >
        {/* North needle */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: 2, height: 18, background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }}
        />
        {/* South needle */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: 2, height: 18, background: 'rgba(255,255,255,0.2)' }}
        />
        {/* Center dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400" />
      </div>

      {/* Heading readout */}
      <span
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-mono text-[9px] text-cyan-400/60 tabular-nums whitespace-nowrap"
      >
        {status === 'animating' ? `${Math.round(heading)}°` : '---°'}
      </span>
    </div>
  );
}
