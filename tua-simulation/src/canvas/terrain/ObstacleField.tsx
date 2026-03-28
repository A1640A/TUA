'use client';
import { useRef, useMemo, useEffect } from 'react';
import { useFrame, ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useObstacleStore } from '@/store/obstacleStore';
import { useTerrainStore } from '@/store/terrainStore';
import type { Obstacle } from '@/types/simulation.types';
import { getWorldY } from '@/canvas/terrain/MoonTerrain';

// ─── Visual config per variant ─────────────────────────────────────────────────
// rx = primary radius (world units), ry = height scale
// ring = HazardRing outer multiplier, glow = emissive colour
// footprint = flat radius of the ground-plane clearance disc shown during placement preview
interface VariantConfig {
  rx:        number;
  ry:        number;
  ring:      number;
  glow:      string;
  footprint: number;  // half-diameter of A* blocked zone in world units
}

//
// SCALE REFERENCE (GRID_SIZE=128, TERRAIN_SCALE=80 → 1 cell ≈ 0.625 wu)
//   Rover dims: chassis width ≈ 1.6wu, height ≈ 0.7wu, half-length ≈ 1.0wu
//
const CONFIGS: Record<Obstacle['variant'], VariantConfig> = {
  'boulder-sm': { rx: 0.30, ry: 0.24, ring: 1.5,  glow: '#ff5522', footprint:  0.6 },  // unchanged — small chip
  'boulder-md': { rx: 1.10, ry: 0.85, ring: 1.45, glow: '#ff4400', footprint:  2.0 },  // ~1 wheel radius (0.22) → ×5
  'boulder-lg': { rx: 3.20, ry: 2.50, ring: 1.35, glow: '#ff2200', footprint:  5.0 },  // 2× rover height, intimidating mass
  'crater':     { rx: 8.00, ry: 0.40, ring: 1.18, glow: '#ff6600', footprint: 12.0 },  // 10-15 grid cells across
  'dust-mound': { rx: 5.00, ry: 2.20, ring: 1.20, glow: '#ffaa44', footprint:  7.5 },  // 8 grid cells dia, 2× chassis height
  'antenna':    { rx: 2.00, ry: 2.80, ring: 1.50, glow: '#00bbff', footprint:  3.5 },  // large crash debris
};

// ─── Seed-based orientation ────────────────────────────────────────────────────
function seedRotation(seed: number): [number, number, number] {
  const s1 = Math.sin(seed * 127.1) * 0.5 + 0.5;
  const s2 = Math.sin(seed * 311.7) * 0.5 + 0.5;
  const s3 = Math.sin(seed * 74.3)  * 0.5 + 0.5;
  return [s1 * Math.PI * 2, s2 * Math.PI * 2, s3 * Math.PI * 2];
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOULDER — SMALL  (unchanged, small angular basalt chip)
// ─────────────────────────────────────────────────────────────────────────────
function BoulderSm({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const rot = seedRotation(seed);
  return (
    <>
      <mesh castShadow receiveShadow rotation={rot}>
        <dodecahedronGeometry args={[cfg.rx, 0]} />
        <meshStandardMaterial ref={matRef} color="#6b5c4c" roughness={0.96} metalness={0.04}
          emissive={cfg.glow} emissiveIntensity={0.0} />
      </mesh>
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.55, -cfg.ry * 0.3, cfg.rx * -0.5]}
        rotation={[rot[0] + 0.9, rot[1] + 0.5, rot[2]]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.52, 0]} />
        <meshStandardMaterial color="#594d3f" roughness={0.98} metalness={0.02} />
      </mesh>
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
//  BOULDER — MEDIUM  (roughly one rover wheel in height, ~1.1wu radius)
//  Warmer ochre tones. High-segment sphere with scale deformation so it
//  reads clearly as a solid, real rock — not too small to miss.
// ─────────────────────────────────────────────────────────────────────────────
function BoulderMd({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const rot  = seedRotation(seed);
  const scaleX = 0.80 + (Math.sin(seed) * 0.5 + 0.5) * 0.30;
  const scaleZ = 0.85 + (Math.cos(seed * 2.3) * 0.5 + 0.5) * 0.28;
  return (
    <>
      {/* Main body — deformed sphere */}
      <mesh castShadow receiveShadow scale={[scaleX, 1.0, scaleZ]} rotation={rot}>
        <sphereGeometry args={[cfg.rx, 14, 10]} />
        <meshStandardMaterial ref={matRef} color="#726050" roughness={0.94} metalness={0.06}
          emissive={cfg.glow} emissiveIntensity={0.0} />
      </mesh>
      {/* Satellite boulder — major split face */}
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.70, -cfg.ry * 0.25, cfg.rx * -0.48]}
        rotation={[rot[0] + 0.6, rot[1] + 1.1, rot[2]]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.55, 0]} />
        <meshStandardMaterial color="#615040" roughness={0.97} metalness={0.03} />
      </mesh>
      {/* Flat slab — bedded basalt exposure */}
      <mesh castShadow receiveShadow
        position={[-cfg.rx * 0.55, -cfg.ry * 0.38, cfg.rx * 0.38]}
        rotation={[rot[0] * 0.4, rot[1], -0.5]}
        scale={[1.4, 0.30, 0.9]}
      >
        <boxGeometry args={[cfg.rx * 0.7, cfg.rx * 0.5, cfg.rx * 0.6]} />
        <meshStandardMaterial color="#5a4a38" roughness={0.98} metalness={0.02} />
      </mesh>
      {/* Scatter pebbles */}
      {[0, 1, 2].map((j) => {
        const angle  = (j / 3) * Math.PI * 2 + seed;
        const radius = cfg.rx * (1.1 + j * 0.15);
        return (
          <mesh key={j} castShadow
            position={[Math.cos(angle) * radius, -cfg.ry * 0.42, Math.sin(angle) * radius]}
          >
            <dodecahedronGeometry args={[0.08 + j * 0.04, 0]} />
            <meshStandardMaterial color="#7a6a55" roughness={0.99} metalness={0.01} />
          </mesh>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOULDER — LARGE  (rx=3.2wu → twice the rover height ≈ 2.5wu)
//  Multi-body cluster. High-subdivision sphere + perlin-style vertex noise
//  approximated via anisotropic non-uniform scale. Dark iron-rich basalt.
// ─────────────────────────────────────────────────────────────────────────────
function BoulderLg({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const rot  = seedRotation(seed);
  const rot2 = seedRotation(seed + 13.7);
  const rot3 = seedRotation(seed + 27.4);
  const scx  = 0.80 + (Math.sin(seed * 3.1) * 0.5 + 0.5) * 0.30;
  const scz  = 0.85 + (Math.cos(seed * 1.7) * 0.5 + 0.5) * 0.25;

  // Scatter pebble field — wide arc around the massive formation
  const pebbles = useMemo(() => {
    return Array.from({ length: 12 }, (_, j) => {
      const angle  = (j / 12) * Math.PI * 1.9 + seed * 0.8;
      const r      = cfg.rx * (1.35 + Math.sin(j * 2.3) * 0.30);
      const size   = 0.06 + Math.abs(Math.cos(j * 1.7 + seed)) * 0.08;
      return { pos: [Math.cos(angle) * r, -cfg.ry * 0.48, Math.sin(angle) * r] as [number,number,number], size };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.rx, cfg.ry, seed]);

  return (
    <>
      {/* Dominant central mass — high-segment sphere with extreme scale deformation */}
      <mesh castShadow receiveShadow scale={[scx, 1.0, scz]} rotation={rot}>
        <sphereGeometry args={[cfg.rx, 20, 14]} />
        <meshStandardMaterial ref={matRef} color="#5e4e3e" roughness={0.92} metalness={0.07}
          emissive={cfg.glow} emissiveIntensity={0.0} />
      </mesh>
      {/* Right shard — major cleaved face */}
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.70, -cfg.ry * 0.08, cfg.rx * -0.55]}
        rotation={[rot2[0], rot2[1], rot2[2]]}
        scale={[0.75, 0.85, 0.90]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.65, 1]} />
        <meshStandardMaterial color="#4e3e2e" roughness={0.96} metalness={0.05} />
      </mesh>
      {/* Left counter-shard */}
      <mesh castShadow receiveShadow
        position={[-cfg.rx * 0.62, -cfg.ry * 0.18, cfg.rx * 0.48]}
        rotation={[rot[0] + 0.8, rot[1] - 0.5, rot[2] + 0.3]}
        scale={[0.85, 0.78, 1.0]}
      >
        <dodecahedronGeometry args={[cfg.rx * 0.55, 1]} />
        <meshStandardMaterial color="#685848" roughness={0.95} metalness={0.05} />
      </mesh>
      {/* Rear mass — partially buried */}
      <mesh castShadow receiveShadow
        position={[cfg.rx * 0.15, -cfg.ry * 0.35, cfg.rx * 0.62]}
        rotation={[rot3[0], rot3[1], rot3[2]]}
        scale={[0.90, 0.65, 0.80]}
      >
        <sphereGeometry args={[cfg.rx * 0.48, 12, 9]} />
        <meshStandardMaterial color="#584838" roughness={0.97} metalness={0.04} />
      </mesh>
      {/* Flat bedrock slab protruding from base */}
      <mesh castShadow receiveShadow
        position={[0, -cfg.ry * 0.45, cfg.rx * 0.22]}
        rotation={[-0.14, rot[1] * 0.25, 0.10]}
        scale={[1.7, 0.22, 1.3]}
      >
        <boxGeometry args={[cfg.rx * 0.90, cfg.rx * 0.40, cfg.rx * 0.75]} />
        <meshStandardMaterial color="#3e3022" roughness={0.99} metalness={0.02} />
      </mesh>
      {/* Pebble impact scatter */}
      {pebbles.map((p, i) => (
        <mesh key={i} castShadow position={p.pos}>
          <dodecahedronGeometry args={[Math.max(0.04, p.size), 0]} />
          <meshStandardMaterial color="#7e6e5a" roughness={0.99} metalness={0.01} />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CRATER — OBSTACLE  (rx=8.0wu → massive, diameter = 10-15 grid cells)
//  Deep bowl with raised ejecta rim and high-albedo blanket.
//  Morphology follows Pike (1977): depth/diameter ≈ 0.196, rim/dia ≈ 0.036.
//  The terrain deformation carves the REAL geometry — this mesh adds the
//  visual detail layer on top: rim torus + floor marker + ejecta chips.
// ─────────────────────────────────────────────────────────────────────────────
function CraterObstacle({
  cfg, matRef,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void }) {
  const D     = cfg.rx * 2;         // diameter
  const rimH  = D * 0.036;          // Pike(1977) rim height
  const floorY = -D * 0.120;        // bowl floor depression

  const ejectaChips = useMemo(() => {
    const chips: { pos: [number,number,number]; size: number; rot: [number,number,number] }[] = [];
    for (let i = 0; i < 18; i++) {
      const angle  = (i / 18) * Math.PI * 2 + i * 0.32;
      const dist   = cfg.rx * (0.88 + Math.sin(i * 3.7) * 0.16);
      const height = rimH * (0.5 + Math.abs(Math.sin(i * 2.1)) * 1.4);
      const size   = 0.18 + Math.abs(Math.sin(i * 5.3)) * 0.22;
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
      {/* Dark basalt floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.02, 0]}>
        <circleGeometry args={[cfg.rx * 0.70, 56]} />
        <meshStandardMaterial color="#0e0c09" roughness={1.0} metalness={0.0} />
      </mesh>
      {/* Inner bowl wall — dark gradient slope */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY * 0.42 + 0.01, 0]}>
        <ringGeometry args={[cfg.rx * 0.70, cfg.rx * 1.02, 56]} />
        <meshStandardMaterial color="#1e1610" roughness={0.99} metalness={0.0} />
      </mesh>
      {/* Raised ejecta rim — prominent torus */}
      <mesh castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, rimH * 1.2, 0]}>
        <torusGeometry args={[cfg.rx * 0.98, rimH * 2.2, 10, 64]} />
        <meshStandardMaterial ref={matRef} color="#7c6a52" roughness={0.91} metalness={0.06}
          emissive={cfg.glow} emissiveIntensity={0.0} />
      </mesh>
      {/* High-albedo ejecta blanket — bright ring outside rim */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, rimH * 0.25, 0]}>
        <ringGeometry args={[cfg.rx * 1.06, cfg.rx * 1.38, 56]} />
        <meshStandardMaterial color="#c2b49a" roughness={0.97} metalness={0.0} opacity={0.70} transparent />
      </mesh>
      {/* Ejecta rock chips — sized for the large scale */}
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
//  DUST MOUND  (rx=5wu → 8 grid cells diameter, ry=2.2wu → 2× chassis height)
//  Smooth regolith hill. Real elevation is handled by terrainStore.deformTerrain.
//  This mesh renders the visual surface: hemisphere + layered bump texture.
// ─────────────────────────────────────────────────────────────────────────────
function DustMound({
  cfg, matRef, seed,
}: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial | null) => void; seed: number }) {
  const scaleX = 1.0 + Math.sin(seed * 4.1) * 0.14;
  const scaleZ = 1.0 + Math.cos(seed * 2.9) * 0.12;

  const bumps = useMemo(() => {
    const b: { pos: [number,number,number]; r: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + seed;
      const dist  = cfg.rx * (0.35 + Math.sin(i * 3.1 + seed) * 0.30);
      const ht    = cfg.ry * (0.45 + Math.sin(i * 5.7) * 0.32);
      const r     = 0.12 + Math.abs(Math.cos(i * 2.3 + seed)) * 0.18;
      b.push({ pos: [Math.cos(angle) * dist, ht, Math.sin(angle) * dist], r });
    }
    return b;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.rx, cfg.ry, seed]);

  return (
    <>
      {/* Main hemisphere */}
      <mesh castShadow receiveShadow scale={[scaleX, 1.0, scaleZ]}>
        <sphereGeometry args={[cfg.rx, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.50]} />
        <meshStandardMaterial ref={matRef} color="#c8a070" roughness={1.0} metalness={0.0}
          emissive={cfg.glow} emissiveIntensity={0.0} />
      </mesh>
      {/* Wide spread base disc */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[scaleX, scaleZ, 1]}>
        <circleGeometry args={[cfg.rx * 1.25, 48]} />
        <meshStandardMaterial color="#b08050" roughness={1.0} metalness={0.0} opacity={0.85} transparent />
      </mesh>
      {/* Surface texture bumps */}
      {bumps.map((b, i) => (
        <mesh key={i} castShadow position={b.pos}>
          <sphereGeometry args={[b.r, 8, 6]} />
          <meshStandardMaterial color="#b89060" roughness={1.0} metalness={0.0} />
        </mesh>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANTENNA — CRASHED PROBE DEBRIS  (rx=2wu — much larger impact spread)
//  Toppled lander / comms antenna with wide solar panel spread, RTG glow,
//  and blinking distress LED. Footprint clearly exceeds rover width.
// ─────────────────────────────────────────────────────────────────────────────
function AntennaDebris({
  cfg, matRef, ledRef,
}: {
  cfg:    VariantConfig;
  matRef: (el: THREE.MeshStandardMaterial | null) => void;
  ledRef: (el: THREE.MeshStandardMaterial | null) => void;
}) {
  const mastH  = cfg.ry * 1.85;
  const tilt   = 0.34;
  const tiltAz = 0.18;

  return (
    <>
      {/* Ground footpad */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[0.18, 0.55, 18]} />
        <meshStandardMaterial color="#909aaa" metalness={0.80} roughness={0.22} />
      </mesh>
      {/* Main mast */}
      <group rotation={[tilt, tiltAz, 0]}>
        <mesh castShadow receiveShadow position={[0, mastH * 0.5, 0]}>
          <cylinderGeometry args={[0.045, 0.075, mastH, 10]} />
          <meshStandardMaterial ref={matRef} color="#b8c2d0" metalness={0.88} roughness={0.14}
            emissive={cfg.glow} emissiveIntensity={0.0} />
        </mesh>
        {/* Secondary boom */}
        <mesh castShadow receiveShadow position={[0, mastH * 0.72, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.80, 7]} />
          <meshStandardMaterial color="#a0aab8" metalness={0.92} roughness={0.12} />
        </mesh>
        {/* Parabolic dish */}
        <group position={[0.09, mastH * 1.02, 0.20]} rotation={[0.55, 0.35, -0.28]}>
          <mesh castShadow>
            <torusGeometry args={[0.60, 0.04, 9, 32]} />
            <meshStandardMaterial color="#7888a0" metalness={0.82} roughness={0.22} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.58, 18, 11, 0, Math.PI * 2, 0, Math.PI * 0.38]} />
            <meshStandardMaterial color="#6a7a90" metalness={0.75} roughness={0.28} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.35, 0]}>
            <coneGeometry args={[0.05, 0.22, 7]} />
            <meshStandardMaterial color="#9090a8" metalness={0.90} roughness={0.18} />
          </mesh>
        </group>
        {/* RTG heat source */}
        <mesh castShadow position={[0, mastH * 0.18, 0.07]}>
          <cylinderGeometry args={[0.10, 0.10, 0.42, 9]} />
          <meshStandardMaterial color="#d0580a" metalness={0.60} roughness={0.35}
            emissive="#ff6600" emissiveIntensity={0.40} />
        </mesh>
        {/* Blinking distress LED */}
        <mesh position={[0.04, mastH * 1.12, 0.22]}>
          <sphereGeometry args={[0.038, 9, 9]} />
          <meshStandardMaterial ref={ledRef} color="#00ccff" emissive="#00ccff" emissiveIntensity={2.4} />
        </mesh>
      </group>
      {/* Broken cross-boom lying on surface */}
      <mesh castShadow receiveShadow position={[0.32, 0.05, 0.09]} rotation={[0, 0.55, Math.PI / 2]}>
        <cylinderGeometry args={[0.030, 0.030, 1.20, 7]} />
        <meshStandardMaterial color="#a0aab8" metalness={0.90} roughness={0.14} />
      </mesh>
      {/* Solar panel wing A */}
      <mesh castShadow receiveShadow position={[-cfg.rx * 0.72, 0.04, -0.18]} rotation={[-0.14, 0.28, 0.10]}>
        <boxGeometry args={[cfg.rx * 1.05, 0.028, 0.55]} />
        <meshStandardMaterial color="#1a2a5c" metalness={0.70} roughness={0.25}
          emissive="#1a3aaa" emissiveIntensity={0.14} />
      </mesh>
      {/* Solar panel wing B */}
      <mesh castShadow receiveShadow position={[cfg.rx * 0.62, 0.08, 0.40]} rotation={[-0.42, -0.32, 0.38]}>
        <boxGeometry args={[cfg.rx * 0.90, 0.028, 0.50]} />
        <meshStandardMaterial color="#192558" metalness={0.70} roughness={0.28}
          emissive="#152ab0" emissiveIntensity={0.12} />
      </mesh>
      {/* Debris scatter — bolts and shards */}
      {[0, 1, 2, 3, 4, 5, 6].map((j) => {
        const angle = (j / 7) * Math.PI * 2 + j * 0.5;
        const dist  = cfg.rx * (0.40 + j * 0.10);
        return (
          <mesh key={j} castShadow
            position={[Math.cos(angle) * dist, 0.015, Math.sin(angle) * dist]}
            rotation={[j * 0.5, angle, j * 0.7]}
          >
            <boxGeometry args={[0.07 + j * 0.025, 0.015 + j * 0.006, 0.055 + j * 0.018]} />
            <meshStandardMaterial color="#909aaa" metalness={0.82} roughness={0.20} />
          </mesh>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  FOOTPRINT PREVIEW DISC
//  Rendered under the cursor while placingObstacle=true.
//  Shows the exact clearance footprint of the selected obstacle variant
//  so the user can see the blocked area before dropping.
// ─────────────────────────────────────────────────────────────────────────────
function FootprintPreview({ variant }: { variant: Obstacle['variant'] }) {
  const cfg       = CONFIGS[variant];
  const terrain   = useTerrainStore(s => s.terrain);
  const { gl, camera } = useThree();
  const groupRef  = useRef<THREE.Group>(null);
  const matRef    = useRef<THREE.MeshStandardMaterial>(null);

  // Internal raycaster — updates in useFrame from mouse position
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef     = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  useEffect(() => {
    const canvas = gl.domElement;
    const onMove = (e: MouseEvent) => {
      const rect  = canvas.getBoundingClientRect();
      const mx    = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const my    = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      const mouse = new THREE.Vector2(mx, my);
      raycasterRef.current.setFromCamera(mouse, camera);

      // Intersect against a horizontal plane at the approximate terrain height
      // (The exact Y will be corrected by sampling the heightmap below)
      const hit = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(planeRef.current, hit);

      if (hit && groupRef.current && terrain?.heightMap) {
        const wx = hit.x, wz = hit.z;
        // Sample exact terrain height at the cursor world position
        const wy = getWorldY(terrain.heightMap, wx, wz);
        groupRef.current.position.set(wx, wy + 0.05, wz);
      }
    };
    canvas.addEventListener('mousemove', onMove);
    return () => canvas.removeEventListener('mousemove', onMove);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, camera, gl]);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.elapsedTime;
    matRef.current.opacity = 0.22 + Math.abs(Math.sin(t * 2.0)) * 0.20;
  });

  return (
    <group ref={groupRef}>
      {/* Solid footprint disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[cfg.footprint, 56]} />
        <meshStandardMaterial
          ref={matRef}
          color={cfg.glow}
          emissive={cfg.glow}
          emissiveIntensity={0.8}
          transparent
          opacity={0.28}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Dashed outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[cfg.footprint * 0.97, cfg.footprint * 1.06, 56]} />
        <meshStandardMaterial
          color={cfg.glow}
          emissive={cfg.glow}
          emissiveIntensity={1.4}
          transparent
          opacity={0.60}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ObstacleField() {
  const obstacles      = useObstacleStore(s => s.obstacles);
  const removeObs      = useObstacleStore(s => s.removeObstacle);
  const placingObst    = useObstacleStore(s => s.placingObstacle);
  const selectedVar    = useObstacleStore(s => s.selectedVariant);

  // Two ref arrays: pulse materials (general glow) and LED (fast blink)
  const matsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const ledsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    matsRef.current.forEach((mat, i) => {
      if (!mat) return;
      const obs = obstacles[i];
      if (!obs) return;
      if (obs.variant === 'antenna') { mat.emissiveIntensity = 0; return; }
      mat.emissiveIntensity = 0;
    });
    ledsRef.current.forEach((led) => {
      if (!led) return;
      const blink = Math.sin(t * Math.PI * 2.5) > 0.2;
      led.emissiveIntensity = blink ? 2.5 : 0.05;
    });
  });

  return (
    <>
      {/* Footprint preview disc — shown while in placement mode */}
      {placingObst && <FootprintPreview variant={selectedVar} />}

      {obstacles.map((obs, i) => {
        const cfg       = CONFIGS[obs.variant];
        const isCrater  = obs.variant === 'crater';
        const isAntenna = obs.variant === 'antenna';
        const isDust    = obs.variant === 'dust-mound';
        // Y positioning: craters and dust mounds sit at terrain level (their
        // height is baked into the terrain geometry by deformTerrain).
        // Boulders/antenna sit their visual radius above the terrain surface.
        const meshR = (isCrater || isDust) ? 0 : isAntenna ? 0.08 : cfg.rx;
        const yPos  = obs.worldPos[1] + meshR;
        const seed  = obs.worldPos[0] * 13.7 + obs.worldPos[2] * 7.3;

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
            {/* ── Hazard ring ── */}
            <HazardRing cfg={cfg} isCrater={isCrater} isDust={isDust} index={i} />
          </group>
        );
      })}
    </>
  );
}

// ─── Hazard Ring ──────────────────────────────────────────────────────────────

function HazardRing({
  cfg, isCrater, isDust, index,
}: {
  cfg: VariantConfig; isCrater: boolean; isDust: boolean; index: number;
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.elapsedTime;
    matRef.current.opacity = 0.25 + Math.abs(Math.sin(t * 0.85 + index * 1.05)) * 0.32;
  });

  const innerR = cfg.rx * (isCrater ? 1.08 : isDust ? 1.04 : 0.82);
  const outerR = cfg.rx * cfg.ring;
  const yOff   = isCrater ? 0.03 : -(cfg.ry - 0.03);

  return (
    <mesh position={[0, yOff, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[innerR, outerR, 56]} />
      <meshStandardMaterial
        ref={matRef}
        color={cfg.glow}
        emissive={cfg.glow}
        emissiveIntensity={1.3}
        transparent
        opacity={0.35}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
