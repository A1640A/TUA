'use client';
import { useEffect, useState } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import Compass from './Compass';
import ApiStatusBadge from './ApiStatusBadge';

// ─── Mission Timer ─────────────────────────────────────────────────────────────
function MissionTimer() {
  const missionStartMs = useSimulationStore(s => s.missionStartMs);
  const [display, setDisplay] = useState('--:--:---');
  useEffect(() => {
    if (!missionStartMs) { setDisplay('--:--:---'); return; }
    const id = setInterval(() => {
      const elapsed = Date.now() - missionStartMs;
      const mm = String(Math.floor(elapsed / 60000)).padStart(2, '0');
      const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
      const ms = String(elapsed % 1000).padStart(3, '0');
      setDisplay(`${mm}:${ss}:${ms}`);
    }, 50);
    return () => clearInterval(id);
  }, [missionStartMs]);
  return (
    <span className="font-mono text-xs text-cyan-400 tracking-widest tabular-nums">{display}</span>
  );
}

// ─── Status LED ───────────────────────────────────────────────────────────────
function StatusLED({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${active ? `${color} animate-pulse` : 'bg-white/20'}`} />
      <span className="text-[9px] font-mono text-white/40 uppercase tracking-[0.15em]">{label}</span>
    </div>
  );
}

// ─── HUD Root ─────────────────────────────────────────────────────────────────
export default function HUD() {
  const status      = useSimulationStore(s => s.status);
  const obstacles   = useObstacleStore(s => s.obstacles);
  const cameraMode  = useSimulationStore(s => s.cameraMode);
  const setCameraMode         = useSimulationStore(s => s.setCameraMode);
  const showClearanceBounds   = useSimulationStore(s => s.showClearanceBounds);
  const toggleClearanceBounds = useSimulationStore(s => s.toggleClearanceBounds);

  const isFpv     = cameraMode === 'fpv';
  const isBounds  = showClearanceBounds;
  const apiOk     = status !== 'error';
  const terrainOk = true;
  const roverOk   = status === 'animating' || status === 'completed';

  const [isPointerLocked, setIsPointerLocked] = useState(false);
  useEffect(() => {
    const onChange = () => setIsPointerLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  return (
    <>
      {/* ── FPV Full-Screen Overlay ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', inset: 0,
          pointerEvents: 'none',
          opacity: isFpv ? 1 : 0,
          transition: 'opacity 0.6s ease',
          zIndex: 5,
        }}
      >
        {/* Vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 75% 70% at 50% 52%, transparent 45%, rgba(0,0,0,0.72) 100%)',
        }} />
        {/* Scanlines */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'repeating-linear-gradient(0deg, rgba(0,212,255,0.025) 0px, rgba(0,212,255,0.025) 1px, transparent 1px, transparent 3px)',
          mixBlendMode: 'screen',
        }} />
        {/* Corner brackets */}
        {[
          { top: 18, left: 18, borderTop: '2px solid rgba(0,212,255,0.6)', borderLeft: '2px solid rgba(0,212,255,0.6)' },
          { top: 18, right: 18, borderTop: '2px solid rgba(0,212,255,0.6)', borderRight: '2px solid rgba(0,212,255,0.6)' },
          { bottom: 18, left: 18, borderBottom: '2px solid rgba(0,212,255,0.6)', borderLeft: '2px solid rgba(0,212,255,0.6)' },
          { bottom: 18, right: 18, borderBottom: '2px solid rgba(0,212,255,0.6)', borderRight: '2px solid rgba(0,212,255,0.6)' },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: 40, height: 40, ...s }} />
        ))}
        {/* FPV label */}
        <div style={{
          position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px',
          background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.35)',
          borderRadius: 4, backdropFilter: 'blur(4px)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px #00d4ff', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.22em', color: 'rgba(0,212,255,0.85)', textTransform: 'uppercase' }}>
            FPV — ARAÇ KAMERASİ AKTİF
          </span>
        </div>
        {/* Crosshair */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <div style={{ width: 20, height: 20, border: `1px solid ${isPointerLocked ? 'rgba(0,212,255,0.75)' : 'rgba(0,212,255,0.4)'}`, borderRadius: '50%', transition: 'border-color 0.3s ease' }} />
          {[
            { top: '50%', left: -8,  width: 6,  height: 1, transform: 'translateY(-50%)' },
            { top: '50%', right: -8, width: 6,  height: 1, transform: 'translateY(-50%)' },
            { left: '50%', top: -8,  width: 1, height: 6,  transform: 'translateX(-50%)' },
            { left: '50%', bottom: -8, width: 1, height: 6, transform: 'translateX(-50%)' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', background: 'rgba(0,212,255,0.5)', ...s }} />
          ))}
        </div>
        {/* Pointer lock hint */}
        <div style={{
          position: 'absolute', top: 'calc(50% + 26px)', left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'monospace', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: isPointerLocked ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.7)',
          whiteSpace: 'nowrap', transition: 'color 0.3s ease', pointerEvents: 'none',
        }}>
          {isPointerLocked ? '[ ESC ] — Fareyi Serbest Bırak' : '[ Tıkla ] — Bakışı Kontrol Et'}
        </div>
      </div>

      {/* ── Top Header Bar ────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-2.5 select-none"
        style={{ background: 'linear-gradient(180deg, rgba(8,8,16,0.92) 0%, transparent 100%)', borderBottom: '1px solid rgba(0,212,255,0.08)' }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-mono text-white/25 tracking-[0.2em] uppercase">Görev Kimliği</span>
          <span className="text-xs font-mono text-cyan-400/70 tracking-widest">TUA-MIS-2026-001</span>
        </div>
        <div className="flex flex-col items-center">
          <h1 className="text-[11px] font-semibold tracking-[0.4em] text-white/80 uppercase font-mono">
            TUA // Ay Yüzeyi Otonom Navigasyon
          </h1>
          <div className="w-full h-px mt-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.5), transparent)' }} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <MissionTimer />
          <div className="flex gap-3 mt-0.5">
            <StatusLED label="API"   active={apiOk}     color="bg-green-400" />
            <StatusLED label="Arazi" active={terrainOk} color="bg-cyan-400"  />
            <StatusLED label="Rover" active={roverOk}   color="bg-violet-400" />
          </div>
        </div>
      </div>

      {/* ── Bottom Right: Compass ─────────────────────────────────────────── */}
      <div className="absolute bottom-6 right-6 pointer-events-none">
        <Compass />
      </div>

      {/* ── Bottom Left: Badges ───────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-4 pointer-events-none flex flex-col gap-2 items-start">
        <ApiStatusBadge />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
          style={{ background: 'rgba(0,212,255,0.06)', borderColor: 'rgba(0,212,255,0.2)', boxShadow: '0 0 12px rgba(0,212,255,0.1)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[9px] font-mono text-cyan-400/70 tracking-[0.12em] uppercase">A* · 8-Yön · Öklid · Dinamik</span>
        </div>
      </div>

      {/* ── Bottom-Centre: Buttons ────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto" style={{ zIndex: 20, display: 'flex', gap: 10 }}>

        {/* FPV toggle */}
        <button
          id="camera-mode-toggle"
          onClick={() => setCameraMode(isFpv ? 'orbit' : 'fpv')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 18px', borderRadius: 6,
            border: isFpv ? '1px solid rgba(0,212,255,0.7)' : '1px solid rgba(0,212,255,0.25)',
            background: isFpv ? 'rgba(0,212,255,0.14)' : 'rgba(0,212,255,0.05)',
            boxShadow: isFpv ? '0 0 22px rgba(0,212,255,0.3)' : '0 0 10px rgba(0,212,255,0.08)',
            cursor: 'pointer', transition: 'all 0.3s ease', backdropFilter: 'blur(8px)',
          }}
        >
          <svg width="13" height="10" viewBox="0 0 13 10" fill="none" style={{ opacity: isFpv ? 1 : 0.55 }}>
            <rect x="0.5" y="2.5" width="9" height="7" rx="1" stroke="#00d4ff" strokeWidth="1" />
            <path d="M9.5 5.5L12.5 3.5V8.5L9.5 6.5" stroke="#00d4ff" strokeWidth="1" />
            <circle cx="5" cy="6" r="1.5" fill="#00d4ff" opacity="0.7" />
          </svg>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: isFpv ? 'rgba(0,212,255,1)' : 'rgba(0,212,255,0.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {isFpv ? 'KAMERA: ARAÇ İÇİ' : 'KAMERA: YÖRÜNGE'}
          </span>
          {isFpv && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 6px #00d4ff' }} />}
        </button>

        {/* C-Space bounds toggle */}
        <button
          id="clearance-bounds-toggle"
          title="C-Uzayı Sınır Görselleştirici"
          onClick={toggleClearanceBounds}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 18px', borderRadius: 6,
            border: isBounds ? '1px solid rgba(0,255,200,0.8)' : '1px solid rgba(0,255,200,0.22)',
            background: isBounds ? 'rgba(0,255,200,0.12)' : 'rgba(0,255,200,0.04)',
            boxShadow: isBounds ? '0 0 22px rgba(0,255,200,0.35)' : '0 0 8px rgba(0,255,200,0.06)',
            cursor: 'pointer', transition: 'all 0.3s ease', backdropFilter: 'blur(8px)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: isBounds ? 1 : 0.5 }}>
            <rect x="1" y="1" width="10" height="10" rx="1" stroke="#00ffc8" strokeWidth="1" strokeDasharray="2 1.5" />
            <circle cx="6" cy="6" r="1.5" fill="#00ffc8" opacity="0.7" />
            <line x1="1" y1="1" x2="11" y2="11" stroke="#00ffc8" strokeWidth="0.5" opacity="0.4" />
            <line x1="11" y1="1" x2="1" y2="11" stroke="#00ffc8" strokeWidth="0.5" opacity="0.4" />
          </svg>
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: isBounds ? 'rgba(0,255,200,1)' : 'rgba(0,255,200,0.55)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {isBounds ? 'C-UZAYI: CANLI' : 'C-UZAYI: GİZLİ'}
          </span>
          {isBounds && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ffc8', boxShadow: '0 0 8px #00ffc8' }} />}
        </button>
      </div>

      {/* ── Scanning banner ───────────────────────────────────────────────── */}
      {status === 'scanning' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="px-6 py-3 rounded-xl border text-center"
            style={{ background: 'rgba(0,212,255,0.08)', borderColor: 'rgba(0,212,255,0.3)', boxShadow: '0 0 40px rgba(0,212,255,0.15)' }}>
            <p className="text-[10px] font-mono text-cyan-400 tracking-[0.3em] uppercase animate-pulse">A* Algoritması Taranıyor...</p>
          </div>
        </div>
      )}

      {/* ── Rerouting banner ─────────────────────────────────────────────── */}
      {status === 'rerouting' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="px-5 py-2 rounded-xl border"
            style={{ background: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.4)', boxShadow: '0 0 24px rgba(249,115,22,0.2)' }}>
            <p className="text-[10px] font-mono text-orange-400 tracking-[0.25em] uppercase animate-pulse">⚠ Engel Algılandı – Rota Yeniden Hesaplanıyor</p>
          </div>
        </div>
      )}

      {/* ── Obstacle count ────────────────────────────────────────────────── */}
      {obstacles.length > 0 && (
        <div className="absolute top-14 right-4 pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
            style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[9px] font-mono text-red-400 tracking-[0.1em] uppercase">{obstacles.length} Engel Aktif</span>
          </div>
        </div>
      )}
    </>
  );
}
