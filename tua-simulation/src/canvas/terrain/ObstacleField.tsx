'use client';
import { useRef, useMemo } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useObstacleStore } from '@/store/obstacleStore';
import type { Obstacle } from '@/types/simulation.types';

// ─── Visual config per variant ─────────────────────────────────────────────────
interface VariantConfig {
  rx:   number;
  ry:   number;
  ring: number;
  glow: string;
}

const CONFIGS: Record<Obstacle['variant'], VariantConfig> = {
  'boulder-sm':  { rx: 0.28, ry: 0.22, ring: 1.6,  glow: '#ff5522' },
  'boulder-md':  { rx: 0.45, ry: 0.36, ring: 1.5,  glow: '#ff4400' },
  'boulder-lg':  { rx: 0.68, ry: 0.54, ring: 1.4,  glow: '#ff2200' },
  'crater':      { rx: 0.90, ry: 0.12, ring: 1.25, glow: '#ff6600' },
  'dust-mound':  { rx: 0.55, ry: 0.30, ring: 1.45, glow: '#ffaa44' },
  'antenna':     { rx: 0.16, ry: 0.95, ring: 2.2,  glow: '#00bbff' },
};

// ─── Shared lunar rock material ────────────────────────────────────────────────
// Hapke photometric model approximation: high roughness, very low metalness,
// subtle warm-to-cool colour variation mimicking iron-oxide-rich regolith.

/** Semi-random rotation seeded by position to give each boulder unique orientation */
function seedRotation(seed: number): [number, number, number] {
  const s1 = Math.sin(seed * 127.1) * 0.5 + 0.5;
  const s2 = Math.sin(seed * 311.7) * 0.5 + 0.5;
  const s3 = Math.sin(seed * 74.3)  * 0.5 + 0.5;
  return [s1 * Math.PI * 2, s2 * Math.PI * 2, s3 * Math.PI * 2];
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOULDER — SMALL
//  A sharp-edged, angular impact fragment. Low-detail dodecahedron main body
//  with two offset sub-chunks to break perfect symmetry, mimicking fractured
//  basalt. Colour: dark basalt grey-brown.
// ─────────────────────────────────────────────────────────────────────────────
function BoulderSm({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const rot = seedRotation(seed);
  return (
    <>
      {/* Primary fragment — angular, faceted */}
      <mesh castShadow receiveShadow rotation={rot}>
        <dodecahedronGeometry args={[cfg.rx, 0]} />
        <meshStandardMaterial
          ref={matRef}
          color="#6b5c4c"
          roughness={0.96}
          metalness={0.04}
          emissive={cfg.glow}
          emissiveIntensity={0.0}
        />
      </mesh>
      {/* Secondary shard — slightly buried */}
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.55, -cfg.ry * 0.3, cfg.rx * -0.5]}
        rotation={[rot[0] + 0.9, rot[1] + 0.5, rot[2]]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.52, 0]} />
        <meshStandardMaterial color="#594d3f" roughness={0.98} metalness={0.02} />
      </mesh>
      {/* Tertiary chip */}
      <mesh castShadow receiveShadow
        position={[-cfg.rx * 0.35, -cfg.ry * 0.15, cfg.rx * 0.55]}
        rotation={[rot[0], rot[1] - 1.2, rot[2] + 0.7]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.35, 0]} />
        <meshStandardMaterial color="#7a6a58" roughness={0.97} metalness={0.03} />
      </mesh>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOULDER — MEDIUM
//  Irregular sphere-based rock with secondary cluster. Warmer ochre tones
//  indicate higher plagioclase content vs. dark basalt.
// ─────────────────────────────────────────────────────────────────────────────
function BoulderMd({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const rot = seedRotation(seed);
  // Deform a sphere to look less perfect — scale axes differently
  const scaleX = 0.88 + (Math.sin(seed) * 0.5 + 0.5) * 0.22;
  const scaleZ = 0.90 + (Math.cos(seed * 2.3) * 0.5 + 0.5) * 0.20;
  return (
    <>
      {/* Main body — subtly deformed sphere */}
      <mesh castShadow receiveShadow scale={[scaleX, 1.0, scaleZ]} rotation={rot}>
        <sphereGeometry args={[cfg.rx, 12, 9]} />
        <meshStandardMaterial
          ref={matRef}
          color="#726050"
          roughness={0.95}
          metalness={0.05}
          emissive={cfg.glow}
          emissiveIntensity={0.0}
        />
      </mesh>
      {/* Satellite chunk — nestled at base */}
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.7, -cfg.ry * 0.25, cfg.rx * -0.45]}
        rotation={[rot[0] + 0.6, rot[1] + 1.1, rot[2]]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.58, 0]} />
        <meshStandardMaterial color="#615040" roughness={0.97} metalness={0.03} />
      </mesh>
      {/* Flat slab — simulates bedded basalt exposure */}
      <mesh castShadow receiveShadow
        position={[-cfg.rx * 0.55, -cfg.ry * 0.35, cfg.rx * 0.38]}
        rotation={[rot[0] * 0.4, rot[1], -0.5]}
        scale={[1.4, 0.35, 0.9]}
      >
        <boxGeometry args={[cfg.rx * 0.7, cfg.rx * 0.5, cfg.rx * 0.6]} />
        <meshStandardMaterial color="#5a4a38" roughness={0.98} metalness={0.02} />
      </mesh>
      {/* Tiny scatter pebbles */}
      {[0, 1, 2].map((j) => {
        const angle  = (j / 3) * Math.PI * 2 + seed;
        const radius = cfg.rx * (1.1 + j * 0.15);
        return (
          <mesh key={j} castShadow
            position={[Math.cos(angle) * radius, -cfg.ry * 0.38, Math.sin(angle) * radius]}
          >
            <dodecahedronGeometry args={[0.038 + j * 0.018, 0]} />
            <meshStandardMaterial color="#7a6a55" roughness={0.99} metalness={0.01} />
          </mesh>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOULDER — LARGE
//  Massive formation: multi-body cluster. Simulates a 2–3 m boulder that
//  partially fractured on impact. Dark iron-rich basalt with sharp faces.
// ─────────────────────────────────────────────────────────────────────────────
function BoulderLg({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const rot  = seedRotation(seed);
  const rot2 = seedRotation(seed + 13.7);
  const scx  = 0.85 + (Math.sin(seed * 3.1) * 0.5 + 0.5) * 0.25;
  const scz  = 0.90 + (Math.cos(seed * 1.7) * 0.5 + 0.5) * 0.20;
  return (
    <>
      {/* Dominant central mass */}
      <mesh castShadow receiveShadow scale={[scx, 1.0, scz]} rotation={rot}>
        <sphereGeometry args={[cfg.rx, 14, 10]} />
        <meshStandardMaterial
          ref={matRef}
          color="#685848"
          roughness={0.93}
          metalness={0.06}
          emissive={cfg.glow}
          emissiveIntensity={0.0}
        />
      </mesh>
      {/* Right shard — major split face */}
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.72, -cfg.ry * 0.08, cfg.rx * -0.52]}
        rotation={[rot2[0], rot2[1], rot2[2]]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.65, 0]} />
        <meshStandardMaterial color="#584838" roughness={0.97} metalness={0.04} />
      </mesh>
      {/* Left counter-shard */}
      <mesh castShadow receiveShadow
        position={[-cfg.rx * 0.60, -cfg.ry * 0.20, cfg.rx * 0.45]}
        rotation={[rot[0] + 0.8, rot[1] - 0.5, rot[2] + 0.3]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.52, 0]} />
        <meshStandardMaterial color="#6e5c48" roughness={0.96} metalness={0.04} />
      </mesh>
      {/* Flat bedrock slab protruding from base */}
      <mesh castShadow receiveShadow
        position={[0, -cfg.ry * 0.42, cfg.rx * 0.20]}
        rotation={[-0.12, rot[1] * 0.3, 0.08]}
        scale={[1.6, 0.28, 1.2]}
      >
        <boxGeometry args={[cfg.rx * 0.85, cfg.rx * 0.38, cfg.rx * 0.72]} />
        <meshStandardMaterial color="#4e4030" roughness={0.99} metalness={0.02} />
      </mesh>
      {/* Scatter pebbles in 270° arc */}
      {[0, 1, 2, 3, 4, 5].map((j) => {
        const angle  = (j / 6) * Math.PI * 1.8 + seed * 0.7;
        const radius = cfg.rx * (1.25 + Math.sin(j * 2.3) * 0.25);
        const size   = 0.04 + Math.cos(j * 1.7 + seed) * 0.02;
        return (
          <mesh key={j} castShadow
            position={[Math.cos(angle) * radius, -cfg.ry * 0.45, Math.sin(angle) * radius]}
          >
            <dodecahedronGeometry args={[Math.max(0.025, size), 0]} />
            <meshStandardMaterial color="#7e6e5a" roughness={0.99} metalness={0.01} />
          </mesh>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CRATER — OBSTACLE
//  A small secondary impact crater. Sunken bowl with dark basaltic floor,
//  raised ejecta rim, and scattered high-albedo ejecta chips.
//  Morphology follows Pike (1977): depth/diameter ≈ 0.196, rim height ≈ 0.036D.
// ─────────────────────────────────────────────────────────────────────────────
function CraterObstacle({
  cfg, matRef,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void }) {
  const D = cfg.rx * 2;          // diameter (world units)
  const rimH  = D * 0.036;       // Pike(1977) rim height
  const floorY = -D * 0.120;     // bowl floor depression

  // Ejecta chips: 8 around rim at random radii and heights
  const ejectaChips = useMemo(() => {
    const chips: { pos: [number,number,number]; size: number; rot: [number,number,number] }[] = [];
    for (let i = 0; i < 10; i++) {
      const angle  = (i / 10) * Math.PI * 2 + i * 0.38;
      const dist   = cfg.rx * (0.88 + Math.sin(i * 3.7) * 0.18);
      const height = rimH * (0.5 + Math.abs(Math.sin(i * 2.1)) * 1.2);
      const size   = 0.045 + Math.abs(Math.sin(i * 5.3)) * 0.055;
      chips.push({
        pos: [Math.cos(angle) * dist, height, Math.sin(angle) * dist],
        size,
        rot: [i * 0.7, i * 1.3, i * 0.5],
      });
    }
    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.rx, rimH]);

  return (
    <>
      {/* ── Dark basalt floor (depressed) ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.01, 0]}>
        <circleGeometry args={[cfg.rx * 0.72, 40]} />
        <meshStandardMaterial color="#181310" roughness={1.0} metalness={0.0} />
      </mesh>

      {/* ── Inner bowl wall / slope — dark with slight gradient ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY * 0.45 + 0.005, 0]}>
        <ringGeometry args={[cfg.rx * 0.72, cfg.rx * 1.0, 44]} />
        <meshStandardMaterial color="#2a2218" roughness={0.99} metalness={0.0} />
      </mesh>

      {/* ── Raised ejecta rim (torus section) ── */}
      <mesh castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, rimH, 0]}>
        <torusGeometry args={[cfg.rx * 0.98, rimH * 1.8, 8, 48]} />
        <meshStandardMaterial
          ref={matRef}
          color="#7c6a52"
          roughness={0.92}
          metalness={0.05}
          emissive={cfg.glow}
          emissiveIntensity={0.0}
        />
      </mesh>

      {/* ── High-albedo ejecta blanket (thin bright ring outside rim) ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, rimH * 0.3, 0]}>
        <ringGeometry args={[cfg.rx * 1.08, cfg.rx * 1.35, 44]} />
        <meshStandardMaterial color="#c2b49a" roughness={0.97} metalness={0.0} opacity={0.72} transparent />
      </mesh>

      {/* ── Ejecta rock chips ── */}
      {ejectaChips.map((chip, i) => (
        <mesh key={i} castShadow position={chip.pos} rotation={chip.rot as [number,number,number]}>
          <dodecahedronGeometry args={[chip.size, 0]} />
          <meshStandardMaterial color="#9a8870" roughness={0.97} metalness={0.03} />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  DUST MOUND
//  A smooth regolith accumulation — no hard edges, warm sandy tones.
//  Simulates electrostatically levitated dust that settled into a soft mound.
//  Top hemisphere approach: phiStart=0, phiLength=PI (upper half of sphere).
// ─────────────────────────────────────────────────────────────────────────────
function DustMound({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const scaleX = 1.0 + Math.sin(seed * 4.1) * 0.18;
  const scaleZ = 1.0 + Math.cos(seed * 2.9) * 0.16;

  // Small surface texture bumps — microwave-sintered regolith protrusions
  const bumps = useMemo(() => {
    const b: { pos: [number,number,number]; r: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + seed;
      const dist  = cfg.rx * (0.35 + Math.sin(i * 3.1 + seed) * 0.28);
      const ht    = cfg.ry * (0.55 + Math.sin(i * 5.7) * 0.28);
      const r     = 0.05 + Math.abs(Math.cos(i * 2.3 + seed)) * 0.06;
      b.push({ pos: [Math.cos(angle) * dist, ht, Math.sin(angle) * dist], r });
    }
    return b;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.rx, cfg.ry, seed]);

  return (
    <>
      {/* Main hemisphere mound */}
      <mesh castShadow receiveShadow scale={[scaleX, 1.0, scaleZ]}>
        <sphereGeometry args={[cfg.rx, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.50]} />
        <meshStandardMaterial
          ref={matRef}
          color="#d0a87a"
          roughness={1.0}
          metalness={0.0}
          emissive={cfg.glow}
          emissiveIntensity={0.0}
        />
      </mesh>
      {/* Thin spread base disc — slightly darker settled dust */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} scale={[scaleX, scaleZ, 1]}>
        <circleGeometry args={[cfg.rx * 1.22, 36]} />
        <meshStandardMaterial color="#b8925e" roughness={1.0} metalness={0.0} opacity={0.88} transparent />
      </mesh>
      {/* Micro-texture bumps */}
      {bumps.map((b, i) => (
        <mesh key={i} castShadow position={b.pos}>
          <sphereGeometry args={[b.r, 7, 5]} />
          <meshStandardMaterial color="#c09a6e" roughness={1.0} metalness={0.0} />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANTENNA — CRASHED PROBE DEBRIS
//  Toppled lunar lander / communications antenna. Composed of:
//   • Main mast (aluminium pole, tilted at crash angle)
//   • Parabolic dish (crumpled, off-axis)
//   • Cross-boom (broken, lying on surface)
//   • Dual solar panel wings
//   • RTG cylinder (heat source — orange glow)
//   • Blinking distress LED
// ─────────────────────────────────────────────────────────────────────────────
function AntennaDebris({
  cfg, matRef, ledRef,
}: {
  cfg:    VariantConfig;
  matRef: (el: THREE.MeshStandardMaterial | null) => void;
  ledRef: (el: THREE.MeshStandardMaterial | null) => void;
}) {
  const mastH   = cfg.ry * 1.85;
  const tilt    = 0.30; // crash tilt (radians)
  const tiltAz  = 0.15;

  return (
    <>
      {/* ── Ground footpad (survived impact) ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.10, 0.32, 16]} />
        <meshStandardMaterial color="#909aaa" metalness={0.80} roughness={0.22} />
      </mesh>

      {/* ── Main mast ── */}
      <group rotation={[tilt, tiltAz, 0]}>
        <mesh castShadow receiveShadow position={[0, mastH * 0.5, 0]}>
          <cylinderGeometry args={[0.028, 0.048, mastH, 9]} />
          <meshStandardMaterial
            ref={matRef}
            color="#b8c2d0"
            metalness={0.88}
            roughness={0.14}
            emissive={cfg.glow}
            emissiveIntensity={0.0}
          />
        </mesh>

        {/* ── Secondary boom ── */}
        <mesh castShadow receiveShadow position={[0, mastH * 0.72, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.38, 6]} />
          <meshStandardMaterial color="#a0aab8" metalness={0.92} roughness={0.12} />
        </mesh>

        {/* ── Parabolic dish (crumpled flat disc + cone approximation) ── */}
        <group position={[0.06, mastH * 1.02, 0.12]} rotation={[0.55, 0.35, -0.28]}>
          {/* Dish rim */}
          <mesh castShadow>
            <torusGeometry args={[0.30, 0.025, 8, 28]} />
            <meshStandardMaterial color="#7888a0" metalness={0.82} roughness={0.22} />
          </mesh>
          {/* Dish face */}
          <mesh>
            <sphereGeometry args={[0.295, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
            <meshStandardMaterial color="#6a7a90" metalness={0.75} roughness={0.28} side={THREE.DoubleSide} />
          </mesh>
          {/* Feed horn */}
          <mesh position={[0, -0.18, 0]}>
            <coneGeometry args={[0.028, 0.12, 6]} />
            <meshStandardMaterial color="#9090a8" metalness={0.90} roughness={0.18} />
          </mesh>
        </group>

        {/* ── RTG heat source (cylindrical, warm orange glow) ── */}
        <mesh castShadow position={[0, mastH * 0.18, 0.04]}>
          <cylinderGeometry args={[0.055, 0.055, 0.22, 8]} />
          <meshStandardMaterial
            color="#d0580a"
            metalness={0.60}
            roughness={0.35}
            emissive="#ff6600"
            emissiveIntensity={0.35}
          />
        </mesh>

        {/* ── Blinking distress LED ── */}
        <mesh position={[0.02, mastH * 1.12, 0.12]}>
          <sphereGeometry args={[0.020, 8, 8]} />
          <meshStandardMaterial
            ref={ledRef}
            color="#00ccff"
            emissive="#00ccff"
            emissiveIntensity={2.2}
          />
        </mesh>
      </group>

      {/* ── Broken cross-boom (lying on surface) ── */}
      <mesh castShadow receiveShadow position={[0.18, 0.035, 0.05]} rotation={[0, 0.55, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.62, 6]} />
        <meshStandardMaterial color="#a0aab8" metalness={0.90} roughness={0.14} />
      </mesh>

      {/* ── Solar panel wing A (deployed, partially torn) ── */}
      <mesh castShadow receiveShadow
        position={[-0.38, 0.025, -0.10]}
        rotation={[-0.12, 0.25, 0.08]}
      >
        <boxGeometry args={[0.52, 0.018, 0.26]} />
        <meshStandardMaterial
          color="#1a2a5c"
          metalness={0.70}
          roughness={0.25}
          emissive="#1a3aaa"
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* ── Solar panel wing B (folded at 45°) ── */}
      <mesh castShadow receiveShadow
        position={[0.32, 0.05, 0.22]}
        rotation={[-0.40, -0.30, 0.35]}
      >
        <boxGeometry args={[0.46, 0.018, 0.24]} />
        <meshStandardMaterial
          color="#192558"
          metalness={0.70}
          roughness={0.28}
          emissive="#152ab0"
          emissiveIntensity={0.10}
        />
      </mesh>

      {/* ── Debris scatter — bolts & shards ── */}
      {[0, 1, 2, 3, 4].map((j) => {
        const angle = (j / 5) * Math.PI * 2 + j * 0.6;
        const dist  = 0.35 + j * 0.12;
        return (
          <mesh key={j} castShadow
            position={[Math.cos(angle) * dist, 0.012, Math.sin(angle) * dist]}
            rotation={[j * 0.5, angle, j * 0.7]}
          >
            <boxGeometry args={[0.04 + j * 0.015, 0.01 + j * 0.004, 0.03 + j * 0.010]} />
            <meshStandardMaterial color="#909aaa" metalness={0.82} roughness={0.20} />
          </mesh>
        );
      })}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ObstacleField() {
  const obstacles = useObstacleStore(s => s.obstacles);
  const removeObs = useObstacleStore(s => s.removeObstacle);

  // Two ref arrays: pulse materials (general glow) and LED (fast blink)
  const matsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const ledsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Gentle ambient glow pulse on all primary materials
    matsRef.current.forEach((mat, i) => {
      if (!mat) return;
      const obs = obstacles[i];
      if (!obs) return;
      // Antenna: no pulse on mast (LED handles it)
      if (obs.variant === 'antenna') { mat.emissiveIntensity = 0; return; }
      // Hazard ring is separate; main body only during hover
      mat.emissiveIntensity = 0;
    });

    // LED blink — fast 2.5 Hz square-ish wave
    ledsRef.current.forEach((led) => {
      if (!led) return;
      const blink = Math.sin(t * Math.PI * 2.5) > 0.2;
      led.emissiveIntensity = blink ? 2.4 : 0.05;
    });
  });

  if (!obstacles.length) return null;

  return (
    <>
      {obstacles.map((obs, i) => {
        const cfg       = CONFIGS[obs.variant];
        const isCrater  = obs.variant === 'crater';
        const isAntenna = obs.variant === 'antenna';
        const isDust    = obs.variant === 'dust-mound';
        // Y offset: craters sit at terrain level; boulders/mounds lifted by half-height
        const yPos = obs.worldPos[1] + (isCrater ? 0 : isAntenna ? 0.05 : cfg.ry);
        const seed = obs.worldPos[0] * 13.7 + obs.worldPos[2] * 7.3;

        return (
          <group
            key={obs.id}
            position={[obs.worldPos[0], yPos, obs.worldPos[2]]}
            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              removeObs(obs.id);
            }}
          >
            {/* ── Type-specific 3D mesh ── */}
            {obs.variant === 'boulder-sm' && (
              <BoulderSm cfg={cfg} matRef={el => { matsRef.current[i] = el; }} seed={seed} />
            )}
            {obs.variant === 'boulder-md' && (
              <BoulderMd cfg={cfg} matRef={el => { matsRef.current[i] = el; }} seed={seed} />
            )}
            {obs.variant === 'boulder-lg' && (
              <BoulderLg cfg={cfg} matRef={el => { matsRef.current[i] = el; }} seed={seed} />
            )}
            {obs.variant === 'crater' && (
              <CraterObstacle cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />
            )}
            {obs.variant === 'dust-mound' && (
              <DustMound cfg={cfg} matRef={el => { matsRef.current[i] = el; }} seed={seed} />
            )}
            {obs.variant === 'antenna' && (
              <AntennaDebris
                cfg={cfg}
                matRef={el => { matsRef.current[i] = el; }}
                ledRef={el => { ledsRef.current[i] = el; }}
              />
            )}

            {/* ── Hazard ring ─────────────────────────────────────────────────── */}
            {/* Positioned at ground level, always flat on surface */}
            <HazardRing cfg={cfg} isCrater={isCrater} isDust={isDust} index={i} />
          </group>
        );
      })}
    </>
  );
}

// ─── Hazard Ring (pulled to separate component to keep useFrame encapsulated) ─

function HazardRing({
  cfg, isCrater, isDust, index,
}: {
  cfg: VariantConfig; isCrater: boolean; isDust: boolean; index: number;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.elapsedTime;
    // Slow, breathing pulse — different phase per obstacle
    matRef.current.opacity = 0.28 + Math.abs(Math.sin(t * 0.9 + index * 1.05)) * 0.30;
  });

  const innerR = cfg.rx * (isCrater ? 1.10 : isDust ? 1.05 : 0.85);
  const outerR = cfg.rx * cfg.ring;
  const yOff   = isCrater ? 0.025 : -(cfg.ry - 0.025);

  return (
    <mesh position={[0, yOff, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[innerR, outerR, 48]} />
      <meshStandardMaterial
        ref={matRef}
        color={cfg.glow}
        emissive={cfg.glow}
        emissiveIntensity={1.2}
        transparent
        opacity={0.38}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
