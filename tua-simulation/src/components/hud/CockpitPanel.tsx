'use client';
/**
 * CockpitPanel — Glassmorphism Overhead Rover Tracking Panel
 *
 * Renders a futuristic "Mission Control" satellite-view panel in the bottom-right
 * corner of the screen. Contains:
 *   • FPVMiniCanvas: live overhead (bird's-eye) 3D view following the rover
 *   • REC indicator: pulsing red recording badge
 *   • Compass: heading degrees derived from rover state
 *   • Artificial Horizon: pitch + roll attitude indicator
 *   • RoverIndicator: targeting crosshair locked to rover centre
 *   • Panel toggle: open/close with animated height transition
 *   • Telemetry strip: speed, elevation, signal bar
 *
 * UI Design:
 *   - Glassmorphism: backdrop-blur, semi-transparent borders, glow shadows
 *   - Cyan/teal accent colour matching the rest of the HUD system
 *   - Smooth open/close animation using CSS transition
 */

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useSimulationStore } from '@/store/simulationStore';

// FPVMiniCanvas uses WebGL — must be client-only
const FPVMiniCanvas = dynamic(() => import('@/canvas/FPVMiniCanvas'), { ssr: false });

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Pulsing REC badge */
function RecBadge({ active }: { active: boolean }) {
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setBlink(b => !b), 800);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:         4,
      padding:    '2px 7px',
      borderRadius: 3,
      background:  active && blink ? 'rgba(255,60,60,0.18)' : 'transparent',
      border:      `1px solid ${active ? 'rgba(255,60,60,0.7)' : 'rgba(255,60,60,0.25)'}`,
      transition:  'background 0.4s ease, border-color 0.4s ease',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active && blink ? '#ff3c3c' : 'rgba(255,60,60,0.3)',
        boxShadow:  active && blink ? '0 0 8px #ff3c3c' : 'none',
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
        display:    'inline-block',
      }} />
      <span style={{
        fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em',
        color: active ? (blink ? '#ff3c3c' : 'rgba(255,80,80,0.5)') : 'rgba(255,60,60,0.3)',
        textTransform: 'uppercase', fontWeight: 700,
        transition: 'color 0.4s ease',
      }}>
        REC
      </span>
    </div>
  );
}

/** Heading compass display */
function CompassDisplay({ heading }: { heading: number }) {
  const deg    = Math.round(((heading * 180 / Math.PI) % 360 + 360) % 360);
  const dirs   = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dirIdx = Math.round(deg / 45) % 8;
  const dirStr = dirs[dirIdx];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="14" height="14" viewBox="0 0 14 14">
        {/* Compass rose outline */}
        <circle cx="7" cy="7" r="6" fill="none" stroke="rgba(0,212,255,0.3)" strokeWidth="0.8" />
        {/* North needle (red) */}
        <path
          d="M7,3 L8.2,7 L7,6 L5.8,7 Z"
          fill="rgba(255,80,80,0.85)"
          transform={`rotate(${deg},7,7)`}
        />
        {/* South needle (dim) */}
        <path
          d="M7,11 L8.2,7 L7,8 L5.8,7 Z"
          fill="rgba(0,212,255,0.4)"
          transform={`rotate(${deg},7,7)`}
        />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 11, color: '#00d4ff',
          fontWeight: 700, letterSpacing: '0.05em',
        }}>
          {String(deg).padStart(3, '0')}°
        </span>
        <span style={{
          fontFamily: 'monospace', fontSize: 7, color: 'rgba(0,212,255,0.55)',
          letterSpacing: '0.15em',
        }}>
          {dirStr}
        </span>
      </div>
    </div>
  );
}

/** Artificial horizon / attitude indicator */
function ArtificialHorizon({ pitch, roll }: { pitch: number; roll: number }) {
  const pitchDeg = THREE_MathUtils_clamp(pitch * 180 / Math.PI, -30, 30);
  const rollDeg  = THREE_MathUtils_clamp(roll  * 180 / Math.PI, -45, 45);
  const skyShift = pitchDeg * 1.2; // pixels

  return (
    <div style={{
      width: 56, height: 36,
      borderRadius: 4,
      border: '1px solid rgba(0,212,255,0.25)',
      overflow: 'hidden',
      position: 'relative',
      background: 'rgba(0,0,0,0.3)',
    }}>
      {/* Sky+Ground block, rotated by roll, shifted by pitch */}
      <div style={{
        position: 'absolute',
        width: '200%', height: '200%',
        left: '-50%', top: `calc(-50% + ${skyShift}px)`,
        transform: `rotate(${rollDeg}deg)`,
        transformOrigin: 'center center',
        transition: 'transform 0.1s ease',
      }}>
        {/* Sky */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(180deg, #0a1a3a 0%, #1a3a6a 100%)',
        }} />
        {/* Ground */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(0deg, #3a2810 0%, #5a4020 100%)',
        }} />
        {/* Horizon line */}
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0,
          height: 1, background: 'rgba(255,255,255,0.6)',
          transform: 'translateY(-50%)',
        }} />
      </div>

      {/* Fixed crosshair wings */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', alignItems: 'center', gap: 2,
        pointerEvents: 'none',
      }}>
        <div style={{ width: 10, height: 1.5, background: '#00d4ff', borderRadius: 1 }} />
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          border: '1.5px solid #00d4ff',
          background: 'transparent',
        }} />
        <div style={{ width: 10, height: 1.5, background: '#00d4ff', borderRadius: 1 }} />
      </div>

      {/* Roll indicator tick at top */}
      <div style={{
        position: 'absolute', top: 2,
        left: `calc(50% + ${-rollDeg * 0.5}px)`,
        transform: 'translateX(-50%)',
        width: 1.5, height: 4,
        background: '#00d4ff',
        borderRadius: 1,
        transition: 'left 0.1s ease',
      }} />
    </div>
  );
}

/** Clamp helper (avoids importing THREE just for clamp) */
function THREE_MathUtils_clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Signal strength bar (simulated) */
function SignalBar({ strength }: { strength: number }) {
  const bars = 5;
  const filled = Math.round(strength * bars);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: 4 + i * 2,
            borderRadius: 1,
            background: i < filled
              ? (i < 2 ? '#ff3c3c' : i < 4 ? '#ffaa00' : '#00d4ff')
              : 'rgba(255,255,255,0.1)',
            transition: 'background 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

/** Top-down rover position indicator (replaces crosshair for overhead view) */
function RoverIndicator() {
  return (
    <div style={{
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      pointerEvents: 'none',
      zIndex: 2,
    }}>
      {/* Outer targeting ring */}
      <div style={{
        width: 28, height: 28,
        border: '1px solid rgba(0,212,255,0.55)',
        borderRadius: '50%',
        position: 'relative',
      }}>
        {/* Inner fill (rover dot) */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: 6, height: 6,
          background: 'rgba(0,212,255,0.9)',
          borderRadius: '50%',
          transform: 'translate(-50%,-50%)',
          boxShadow: '0 0 8px rgba(0,212,255,0.8)',
        }} />
        {/* Tick lines */}
        <div style={{ position: 'absolute', top: '50%', left: -7, width: 4, height: 1, background: 'rgba(0,212,255,0.45)', transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', right: -7, width: 4, height: 1, background: 'rgba(0,212,255,0.45)', transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: -7, width: 1, height: 4, background: 'rgba(0,212,255,0.45)', transform: 'translateX(-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', bottom: -7, width: 1, height: 4, background: 'rgba(0,212,255,0.45)', transform: 'translateX(-50%)' }} />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CockpitPanel() {
  const [isOpen, setIsOpen]     = useState(true);
  const roverState = useSimulationStore(s => s.roverState);
  const status     = useSimulationStore(s => s.status);

  const isRecording = status === 'animating';
  const heading     = roverState.heading ?? 0;
  const pitch       = roverState.rotation?.[0] ?? 0;
  const roll        = roverState.rotation?.[2] ?? 0;
  const speed       = roverState.speed ?? 0;
  const elevation   = roverState.elevation ?? 0;

  // Simulated signal strength (1.0 = full bars) — placeholder
  const [signal] = useState(0.8);

  return (
    <div
      style={{
        position:  'relative',
        width:      320,
        userSelect: 'none',
      }}
    >
      {/* ── Toggle Button ────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(o => !o)}
        title={isOpen ? 'Rover Takip Panelini Gizle' : 'Rover Takip Panelini Göster'}
        style={{
          position:   'absolute',
          top:        isOpen ? -26 : 0,
          right:       0,
          display:    'flex',
          alignItems: 'center',
          gap:         5,
          padding:    '3px 10px',
          borderRadius: '4px 4px 0 0',
          border:     '1px solid rgba(0,212,255,0.3)',
          borderBottom: isOpen ? 'none' : '1px solid rgba(0,212,255,0.3)',
          background: 'rgba(0,8,20,0.85)',
          backdropFilter: 'blur(8px)',
          cursor:     'pointer',
          zIndex:      25,
          transition: 'all 0.3s ease',
          pointerEvents: 'auto',
        }}
      >
        {/* Satellite/radar icon */}
        <svg width="10" height="10" viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="3.8" fill="none" stroke="#00d4ff" strokeWidth="0.8" />
          <circle cx="5" cy="5" r="1.2" fill="none" stroke="#00d4ff" strokeWidth="0.8" />
          <circle cx="5" cy="5" r="0.5" fill="#00d4ff" />
          <line x1="1" y1="5" x2="9" y2="5" stroke="#00d4ff" strokeWidth="0.5" opacity="0.4" />
          <line x1="5" y1="1" x2="5" y2="9" stroke="#00d4ff" strokeWidth="0.5" opacity="0.4" />
        </svg>
        <span style={{
          fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.2em',
          color: 'rgba(0,212,255,0.8)', textTransform: 'uppercase',
        }}>
          ROVER TAKİP {isOpen ? '▾' : '▴'}
        </span>
      </button>

      {/* ── Panel Body ───────────────────────────────────────────────── */}
      <div
        style={{
          width:        320,
          height:       isOpen ? 220 : 0,
          overflow:     'hidden',
          borderRadius: isOpen ? '6px 0 6px 6px' : '6px',
          border:       '1px solid rgba(0,212,255,0.22)',
          boxShadow:    '0 0 30px rgba(0,212,255,0.12), 0 0 60px rgba(0,212,255,0.04), inset 0 0 20px rgba(0,8,20,0.8)',
          background:   'rgba(0,8,20,0.75)',
          backdropFilter: 'blur(12px)',
          transition:   'height 0.35s cubic-bezier(0.4,0,0.2,1)',
          position:     'relative',
        }}
      >
        {isOpen && (
          <>
            {/* ── Top bar ──────────────────────────────────────── */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 8px',
              background: 'rgba(0,20,40,0.9)',
              borderBottom: '1px solid rgba(0,212,255,0.15)',
              zIndex: 3,
            }}>
              {/* Left: Label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.22em',
                  color: 'rgba(0,212,255,0.6)', textTransform: 'uppercase',
                }}>
                  TUA-CAM-02
                </span>
                <span style={{
                  fontFamily: 'monospace', fontSize: 7, color: 'rgba(0,212,255,0.35)',
                  letterSpacing: '0.12em',
                }}>
                  KUŞBAKIŞİ ROVER TAKİP
                </span>
              </div>
              {/* Right: REC */}
              <RecBadge active={isRecording} />
            </div>

            {/* ── 3D Canvas area ────────────────────────────────── */}
            <div style={{
              position: 'absolute', top: 26, left: 0, right: 0, bottom: 42,
              overflow: 'hidden',
            }}>
              <FPVMiniCanvas />
              {/* Rover position indicator (top-down view) */}
              <RoverIndicator />
              {/* Scan-line overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'repeating-linear-gradient(0deg, rgba(0,212,255,0.015) 0px, rgba(0,212,255,0.015) 1px, transparent 1px, transparent 3px)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
              }} />
              {/* Vignette */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)',
                pointerEvents: 'none',
              }} />
              {/* Corner brackets */}
              {[
                { top: 4, left: 4 },
                { top: 4, right: 4 },
                { bottom: 4, left: 4 },
                { bottom: 4, right: 4 },
              ].map((style, i) => {
                const isTop    = i < 2;
                const isLeft   = i % 2 === 0;
                return (
                  <div key={i} style={{
                    position: 'absolute', ...style,
                    width: 10, height: 10,
                    borderTop:    isTop    ? '1.5px solid rgba(0,212,255,0.5)' : 'none',
                    borderBottom: !isTop   ? '1.5px solid rgba(0,212,255,0.5)' : 'none',
                    borderLeft:   isLeft   ? '1.5px solid rgba(0,212,255,0.5)' : 'none',
                    borderRight:  !isLeft  ? '1.5px solid rgba(0,212,255,0.5)' : 'none',
                    pointerEvents: 'none',
                  }} />
                );
              })}
            </div>

            {/* ── Bottom telemetry bar ──────────────────────────── */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              height: 42,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 8px',
              background: 'rgba(0,20,40,0.92)',
              borderTop: '1px solid rgba(0,212,255,0.15)',
              gap: 8,
            }}>
              {/* Compass */}
              <CompassDisplay heading={heading} />

              {/* Divider */}
              <div style={{ width: 1, height: 28, background: 'rgba(0,212,255,0.12)' }} />

              {/* Artificial Horizon */}
              <ArtificialHorizon pitch={pitch} roll={roll} />

              {/* Divider */}
              <div style={{ width: 1, height: 28, background: 'rgba(0,212,255,0.12)' }} />

              {/* Telemetry: Speed + Altitude */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#00d4ff', fontWeight: 700 }}>
                    {(speed * 3.6).toFixed(1)}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.1em' }}>
                    KM/H
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(0,212,255,0.7)', fontWeight: 700 }}>
                    {elevation.toFixed(1)}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(0,212,255,0.4)', letterSpacing: '0.1em' }}>
                    M
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 28, background: 'rgba(0,212,255,0.12)' }} />

              {/* Signal strength */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <SignalBar strength={signal} />
                <span style={{ fontFamily: 'monospace', fontSize: 6, color: 'rgba(0,212,255,0.35)', letterSpacing: '0.1em' }}>
                  SIG
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
