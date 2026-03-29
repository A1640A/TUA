'use client';
/**
 * SatelliteMinimap v2 — Düzeltilmiş sürüm
 *
 * ────────────────────────────────────────────────────────────────────
 *  KÖK HATA ANALİZİ (v1)
 * ────────────────────────────────────────────────────────────────────
 *
 *  HATA 1 — Radar tarama "kaymış/offset" görünümü:
 *    v1'de ctx.arc(0, 0, W*0.58, -0.18, 0.18) ile çizilen dilim,
 *    translate(W/2, H/2) sonrası 116px yarıçap çizip canvas dışına
 *    (maksimum 216px) taşıyordu. clip() olmadığından dilim kırpılmadan
 *    yarım/bozuk görünüyordu.
 *    LÜTFİK: Her render başında tam dairesel clip() bölgesi tanımla.
 *
 *  HATA 2 — Gidilen yol gösterilmiyor:
 *    v1 sadece tam planlanan rotayı çizdi (route.path tamamı = tek renk).
 *    "Gidilen yol" ile "kalınan yol" arasında görsel fark yoktu.
 *    DÜZELTME: pathProgress [0,1] değeriyle rotayı ikiye böl:
 *      • Gidilen kısım  → parlak cyan + glow (YAPILDI)
 *      • Kalan kısım    → çok hafif, soluk mavi   (YAPILDI)
 *
 *  HATA 3 — Rover heading koordinat uyumsuzluğu:
 *    RoverState.heading = derece, 0° = Kuzey (+Z yönü).
 *    Minimap'te +Z aşağıya gidiyor (normal 2D convention).
 *    Canvas'ta 0 radyan = sağ, Math.atan2 ile +Z yönü = aşağı.
 *    Doğru açı: scanAngle = -headingDeg * (π/180) (canvas +Y aşağı)
 *    DÜZELTME: sin(headingRad) → sağ/sol, cos(headingRad) → aşağı/yukarı
 *    Bu doğru çünkü worldToMap +Z → aşağı mapliyor.
 *
 * ────────────────────────────────────────────────────────────────────
 *  RENDERING STRATEJİSİ: requestAnimationFrame + Canvas 2D API
 * ────────────────────────────────────────────────────────────────────
 *  Neden FBO / WebGLRenderTarget kullanmıyoruz?
 *  • FBO → tüm sahneyi kare başına 2× render eder, GPU yükü 2×.
 *  • <View> → Next.js App Router + dinamik import uyumsuzluğu.
 *  Canvas 2D: Zustand store'dan okuma, CPU-only, GPU yükü = 0, 60FPS.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useSimulationStore } from '@/store/simulationStore';
import { useObstacleStore } from '@/store/obstacleStore';
import { TERRAIN_SCALE, GRID_SIZE } from '@/lib/constants';

// ─── Sabitler ─────────────────────────────────────────────────────────────────

/** Minimap canvas boyutu (px) – kare */
const MAP_SIZE = 210;
/** Radar daire yarıçapı – canvas'ın yarısından biraz küçük */
const RADAR_R  = MAP_SIZE / 2 - 4;

// ─── Koordinat yardımcıları ───────────────────────────────────────────────────

/**
 * Grid hücre koordinatı → THREE.js dünya koordinatı (X, Z)
 * Waypoints.tsx ve routePointsToVectors ile özdeş formül.
 */
function gridToWorld(g: number): number {
  return (g / GRID_SIZE - 0.5) * TERRAIN_SCALE;
}

/**
 * Dünya XZ → minimap piksel (cx, cy)
 *
 * THREE.js dünyası:  X: sol(−) → sağ(+),  Z: ön(−) → arka(+)
 * Minimap piksel:    X: sol → sağ,         Y: üst → alt
 *
 * +Z → minimap'te AŞAĞI (Y artar).
 * Dönüşüm: tam doğrusal, arketipal sıkıştırma.
 */
function worldToMap(wx: number, wz: number): [number, number] {
  const half = TERRAIN_SCALE / 2;                         // 40
  const px = ((wx + half) / TERRAIN_SCALE) * MAP_SIZE;   // 0-200
  const py = ((wz + half) / TERRAIN_SCALE) * MAP_SIZE;   // 0-200
  return [px, py];
}

// ─── Engel görsel konfigürasyonu ──────────────────────────────────────────────

const OBS_COLOR: Record<string, string> = {
  'boulder-sm': '#ff5522',
  'boulder-md': '#ff4400',
  'boulder-lg': '#ff2200',
  'crater':     '#ff6600',
  'dust-mound': '#ffaa44',
  'antenna':    '#00bbff',
};
const OBS_RADIUS: Record<string, number> = {
  'boulder-sm': 2,
  'boulder-md': 5,
  'boulder-lg': 11,
  'crater':     22,
  'dust-mound': 14,
  'antenna':    5,
};

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export default function SatelliteMinimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number | null>(null);
  const timeRef   = useRef(0);

  // Zustand dilimleri
  const roverState  = useSimulationStore(s => s.roverState);
  const routeResult = useSimulationStore(s => s.routeResult);
  const obstacles   = useObstacleStore(s => s.obstacles);
  const waypoints   = useSimulationStore(s => s.waypoints);

  // Ref'lere taşı — RAF closure'u stale okumadan korur
  const roverRef    = useRef(roverState);
  const routeRef    = useRef(routeResult);
  const obstRef     = useRef(obstacles);
  const wpRef       = useRef(waypoints);

  useEffect(() => { roverRef.current  = roverState; },  [roverState]);
  useEffect(() => { routeRef.current  = routeResult; }, [routeResult]);
  useEffect(() => { obstRef.current   = obstacles; },   [obstacles]);
  useEffect(() => { wpRef.current     = waypoints; },   [waypoints]);

  // ── Render döngüsü ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    timeRef.current += 0.016;
    const t  = timeRef.current;
    const cx = MAP_SIZE / 2;   // merkez X
    const cy = MAP_SIZE / 2;   // merkez Y

    // ── 1. Canvas temizle ────────────────────────────────────────────────────
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    // ── 2. Dairesel clip bölgesi — TÜM çizimler bu bölgede kalır ────────────
    //    Bu olmadan herhangi bir ctx.arc dışa taşar ve "kaymış" görünür.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, RADAR_R, 0, Math.PI * 2);
    ctx.clip();

    // ── 3. Arka plan ─────────────────────────────────────────────────────────
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, RADAR_R);
    bgGrad.addColorStop(0,    'rgba(0,  18, 30, 1.0)');
    bgGrad.addColorStop(0.65, 'rgba(0,   9, 18, 1.0)');
    bgGrad.addColorStop(1,    'rgba(0,   4, 10, 1.0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // ── 4. Radar konsantrik halkaları ────────────────────────────────────────
    for (let ring = 1; ring <= 3; ring++) {
      const r = (RADAR_R * ring) / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = ring === 3
        ? 'rgba(0, 212, 255, 0.22)'
        : 'rgba(0, 212, 255, 0.09)';
      ctx.lineWidth = ring === 3 ? 1 : 0.5;
      ctx.stroke();
    }

    // ── 5. Kuzey-Güney / Doğu-Batı eksen çizgileri ──────────────────────────
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - RADAR_R); ctx.lineTo(cx, cy + RADAR_R);
    ctx.moveTo(cx - RADAR_R, cy); ctx.lineTo(cx + RADAR_R, cy);
    ctx.stroke();

    // ── 6. Dönen radar tarama kolu (düzeltilmiş) ─────────────────────────────
    //    ctx.translate + ctx.rotate → gradient her zaman (0,0)'dan başlar
    //    yani RAFADARin merkezinden başlar. clip() ile daire dışına çıkmaz.
    const sweepAngle = (t * 0.75) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweepAngle);

    // Tarama kolu iz efekti — 3 katmanlı
    for (let layer = 0; layer < 3; layer++) {
      const alphaBase  = [0.18, 0.10, 0.04][layer];
      const angleDelta = [0, -0.25, -0.50][layer];
      const sweepSpan  = [0.28, 0.22, 0.18][layer];
      ctx.save();
      ctx.rotate(angleDelta);
      const g = ctx.createLinearGradient(0, 0, RADAR_R, 0);
      g.addColorStop(0,   `rgba(0, 212, 255, ${alphaBase})`);
      g.addColorStop(0.7, `rgba(0, 212, 255, ${alphaBase * 0.4})`);
      g.addColorStop(1,   'rgba(0, 212, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, RADAR_R, -sweepSpan / 2, sweepSpan / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Tarama kolu ana çizgisi
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.55)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(RADAR_R, 0);
    ctx.stroke();

    ctx.restore(); // translate+rotate'ı geri al

    // ── 7. Tam rota yolu — planlanan (soluk) ─────────────────────────────────
    const route = routeRef.current;
    const rover = roverRef.current;

    if (route?.path && route.path.length >= 2) {
      // Kaçıncı noktaya kadar "gidilmiş" hesapla
      const progress   = Math.max(0, Math.min(1, rover.pathProgress ?? 0));
      const totalPts   = route.path.length;
      const traveledIdx = Math.floor(progress * (totalPts - 1));

      // ── 7a. Kalan yol (soluk, ince) ─────────────────────────────────────
      if (traveledIdx < totalPts - 1) {
        ctx.beginPath();
        for (let i = traveledIdx; i < totalPts; i++) {
          const pt = route.path[i];
          const [px, py] = worldToMap(gridToWorld(pt.x), gridToWorld(pt.z));
          if (i === traveledIdx) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(0, 180, 255, 0.22)';
        ctx.lineWidth   = 1.5;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.stroke();
      }

      // ── 7b. Gidilen yol (parlak, glow'lu) ───────────────────────────────
      if (traveledIdx > 0) {
        // Geniş glow katmanı
        ctx.beginPath();
        for (let i = 0; i <= traveledIdx; i++) {
          const pt = route.path[i];
          const [px, py] = worldToMap(gridToWorld(pt.x), gridToWorld(pt.z));
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.20)';
        ctx.lineWidth   = 5;
        ctx.lineJoin    = 'round';
        ctx.lineCap     = 'round';
        ctx.stroke();

        // Parlak ana hat
        ctx.beginPath();
        for (let i = 0; i <= traveledIdx; i++) {
          const pt = route.path[i];
          const [px, py] = worldToMap(gridToWorld(pt.x), gridToWorld(pt.z));
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        const travelAlpha = 0.70 + Math.sin(t * 3.0) * 0.15;
        ctx.strokeStyle = `rgba(0, 255, 200, ${travelAlpha})`;
        ctx.lineWidth   = 2;
        ctx.shadowColor = '#00ffc8';
        ctx.shadowBlur  = 6;
        ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      // ── 7c. Başlangıç noktası (yeşil) ───────────────────────────────────
      const startPt = route.path[0];
      const [spx, spy] = worldToMap(gridToWorld(startPt.x), gridToWorld(startPt.z));
      ctx.beginPath();
      ctx.arc(spx, spy, 4, 0, Math.PI * 2);
      ctx.fillStyle  = '#22c55e';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur  = 8;
      ctx.fill();
      ctx.shadowBlur  = 0;

      // ── 7d. Hedef noktası (kırmızı) ─────────────────────────────────────
      const endPt = route.path[totalPts - 1];
      const [epx, epy] = worldToMap(gridToWorld(endPt.x), gridToWorld(endPt.z));
      ctx.beginPath();
      ctx.arc(epx, epy, 4, 0, Math.PI * 2);
      ctx.fillStyle  = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur  = 8;
      ctx.fill();
      ctx.shadowBlur  = 0;
    }

    // ── 8. Engeller ─────────────────────────────────────────────────────────
    for (const obs of obstRef.current) {
      // obs.worldPos[0] = world X, obs.worldPos[2] = world Z
      const [opx, opy] = worldToMap(obs.worldPos[0], obs.worldPos[2]);
      const color = OBS_COLOR[obs.variant] ?? '#ff4400';
      const r     = OBS_RADIUS[obs.variant] ?? 4;

      // Glow halkası (nefes alır)
      const pulse = 0.30 + Math.abs(Math.sin(t * 0.85)) * 0.20;
      ctx.beginPath();
      ctx.arc(opx, opy, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = pulse;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 10;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;

      // Dolgu
      const obsGrad = ctx.createRadialGradient(opx, opy, 0, opx, opy, r);
      obsGrad.addColorStop(0, color + 'cc');
      obsGrad.addColorStop(1, color + '22');
      ctx.beginPath();
      ctx.arc(opx, opy, r, 0, Math.PI * 2);
      ctx.fillStyle = obsGrad;
      ctx.fill();
    }

    // ── 9. Rover ─────────────────────────────────────────────────────────────
    const [rx, ry] = worldToMap(rover.position[0], rover.position[2]);

    // Heading: degrees, 0°=North(+Z klockwise).
    // Canvas: +Y aşağı, +Z → aşağı (py artar). Kuzey = aşağı yön.
    // sin(headRad) → sağ/sol offset, cos(headRad) → aşağı/yukarı offset
    const headDeg = rover.heading ?? 0;
    const headRad = (headDeg * Math.PI) / 180;

    // Dış glow halkası (nefes alır)
    const rPulse = 0.55 + Math.sin(t * 3.5) * 0.30;
    ctx.globalAlpha = rPulse;
    ctx.beginPath();
    ctx.arc(rx, ry, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ffaa';
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur  = 16;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;

    // Rover dolu nokta
    ctx.beginPath();
    ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
    ctx.fillStyle  = '#00ffaa';
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.shadowBlur  = 0;

    // Yön oku
    // Convention: headDeg=0 → Kuzey(+Z) → aşağı, headDeg=90 → Doğu(+X) → sağ
    const arrowLen = 14;
    const adx = Math.sin(headRad) * arrowLen;  // +X yönü (sağ)
    const ady = Math.cos(headRad) * arrowLen;  // +Z yönü (aşağı)
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + adx, ry + ady);
    ctx.strokeStyle = '#00ffaa';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur  = 8;
    ctx.lineCap     = 'round';
    ctx.stroke();
    ctx.shadowBlur  = 0;

    // ── 10. Merkez artı işareti (+) ──────────────────────────────────────────
    const crossLen = 7;
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - crossLen, cy); ctx.lineTo(cx + crossLen, cy);
    ctx.moveTo(cx, cy - crossLen); ctx.lineTo(cx, cy + crossLen);
    ctx.stroke();

    // ── 11. Dış çember kenarlığı (clip bölgesi tamamlayıcısı) ────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, RADAR_R - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.35)';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // clip bölgesini kapat
    ctx.restore();

    // ── 12. Köşe braketleri (clip dışında, canvas üstünde) ───────────────────
    // (JSX katmanında render edilecek — Canvas context yerine DOM elementleri)

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'flex-end',
        userSelect:    'none',
      }}
    >
      {/* ─── Başlık Barı ──────────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '5px 12px',
        marginBottom:   4,
        background:     'rgba(0, 6, 14, 0.88)',
        border:         '1px solid rgba(0, 212, 255, 0.4)',
        borderRadius:   6,
        backdropFilter: 'blur(10px)',
        boxShadow:      '0 0 16px rgba(0,212,255,0.10)',
      }}>
        {/* Sol: UYDU durumu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            width:      6,
            height:     6,
            borderRadius: '50%',
            background: '#00d4ff',
            boxShadow:  '0 0 8px #00d4ff',
            display:    'inline-block',
            animation:  'pulse 1.6s ease-in-out infinite',
          }} />
          <span style={{
            fontFamily:    'monospace',
            fontSize:      8,
            letterSpacing: '0.22em',
            color:         '#00d4ff',
            textTransform: 'uppercase',
          }}>
            UYDU: AKTİF
          </span>
        </div>
        {/* Sağ: KOORDİNAT TAKİBİ */}
        <span style={{
          fontFamily:    'monospace',
          fontSize:      7,
          letterSpacing: '0.15em',
          color:         'rgba(0, 212, 255, 0.5)',
          textTransform: 'uppercase',
        }}>
          KOORDİNAT TAKİBİ
        </span>
      </div>

      {/* ─── Radar Çerçevesi ──────────────────────────────────────────────── */}
      <div style={{
        position:        'relative',
        width:           MAP_SIZE,
        height:          MAP_SIZE,
        borderRadius:    '50%',           // daire çerçeve
        border:          '1px solid rgba(0, 212, 255, 0.45)',
        boxShadow:       [
          '0 0 30px rgba(0, 212, 255, 0.15)',
          '0 0 60px rgba(0, 212, 255, 0.06)',
          'inset 0 0 20px rgba(0, 0, 0, 0.6)',
        ].join(', '),
        background:      'rgba(0, 4, 10, 0.95)',
        backdropFilter:  'blur(4px)',
        overflow:        'hidden',
      }}>
        {/* Ana canvas */}
        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          style={{ display: 'block' }}
        />

        {/* Koordinat readout — sol alt köşede, daire içi */}
        <CoordReadout />
      </div>

      {/* ─── Alt Lejant Şeridi ────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '4px 10px',
        marginTop:      5,
        background:     'rgba(0, 6, 14, 0.75)',
        border:         '1px solid rgba(0, 212, 255, 0.15)',
        borderRadius:   5,
        backdropFilter: 'blur(6px)',
      }}>
        <LegendItem color="#00ffaa" label="ROVER" />
        <LegendItem color="#00ffc8" label="GİDİLEN" />
        <LegendItem color="rgba(0,180,255,0.45)" label="KALAN" />
        <LegendItem color="#ff6600" label="ENGEL" />
      </div>
    </div>
  );
}

// ─── Koordinat Readout ────────────────────────────────────────────────────────

function CoordReadout() {
  const pos     = useSimulationStore(s => s.roverState.position);
  const heading = useSimulationStore(s => s.roverState.heading);
  const prog    = useSimulationStore(s => s.roverState.pathProgress);

  return (
    <div style={{
      position:      'absolute',
      bottom:        18,
      left:          22,
      fontFamily:    'monospace',
      fontSize:      7,
      letterSpacing: '0.10em',
      color:         'rgba(0, 255, 170, 0.70)',
      textTransform: 'uppercase',
      lineHeight:    1.7,
      pointerEvents: 'none',
    }}>
      <div>X {pos[0].toFixed(1)}m</div>
      <div>Z {pos[2].toFixed(1)}m</div>
      <div style={{ color: 'rgba(0,212,255,0.5)' }}>
        HDG {Math.round(heading ?? 0)}°
      </div>
      <div style={{ color: 'rgba(0,255,200,0.4)' }}>
        {Math.round((prog ?? 0) * 100)}%
      </div>
    </div>
  );
}

// ─── Lejant Öğesi ────────────────────────────────────────────────────────────

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width:           7,
        height:          7,
        borderRadius:    '50%',
        background:      color,
        boxShadow:       `0 0 4px ${color}`,
        flexShrink:      0,
        display:         'inline-block',
      }} />
      <span style={{
        fontFamily:    'monospace',
        fontSize:      6.5,
        letterSpacing: '0.10em',
        color:         'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  );
}
