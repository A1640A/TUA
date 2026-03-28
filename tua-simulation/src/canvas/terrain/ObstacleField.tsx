'use client';
import { useRef } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useObstacleStore } from '@/store/obstacleStore';
import type { Obstacle } from '@/types/simulation.types';

// ─── Visual config per variant ─────────────────────────────────────────────────

interface VariantConfig {
  /** Main body half-width in Three.js units. */
  rx:     number;
  /** Main body half-height (vertical offset above terrain). */
  ry:     number;
  /** Hazard ring outer multiplier (relative to rx). */
  ring:   number;
  /** Emissive color for the hazard pulse. */
  glow:   string;
}

const CONFIGS: Record<Obstacle['variant'], VariantConfig> = {
  'boulder-sm':  { rx: 0.28, ry: 0.22, ring: 1.5, glow: '#ff4400' },
  'boulder-md':  { rx: 0.45, ry: 0.36, ring: 1.4, glow: '#ff4400' },
  'boulder-lg':  { rx: 0.65, ry: 0.52, ring: 1.35, glow: '#ff2200' },
  'crater':      { rx: 0.80, ry: 0.10, ring: 1.2,  glow: '#ff6600' },
  'dust-mound':  { rx: 0.52, ry: 0.28, ring: 1.4,  glow: '#ff8800' },
  'antenna':     { rx: 0.15, ry: 0.90, ring: 2.0,  glow: '#00aaff' },
};

// ─── Per-variant 3D meshes ─────────────────────────────────────────────────────

function BoulderSm({ cfg, matRef }: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial|null) => void }) {
  return (
    <>
      <mesh castShadow>
        <dodecahedronGeometry args={[cfg.rx, 0]} />
        <meshStandardMaterial ref={matRef} color="#7a6550" roughness={0.97} metalness={0.04}
          emissive={cfg.glow} emissiveIntensity={0.2} />
      </mesh>
    </>
  );
}

function BoulderMd({ cfg, matRef }: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial|null) => void }) {
  return (
    <>
      {/* Main body */}
      <mesh castShadow>
        <sphereGeometry args={[cfg.rx, 10, 8]} />
        <meshStandardMaterial ref={matRef} color="#7a6550" roughness={0.95} metalness={0.05}
          emissive={cfg.glow} emissiveIntensity={0.2} />
      </mesh>
      {/* Secondary chunk */}
      <mesh castShadow position={[cfg.rx * 0.5, cfg.ry * 0.2, cfg.rx * -0.4]} rotation={[0.4, 0.8, 0.2]}>
        <dodecahedronGeometry args={[cfg.rx * 0.55, 0]} />
        <meshStandardMaterial color="#6a5540" roughness={0.98} metalness={0.02} />
      </mesh>
    </>
  );
}

function BoulderLg({ cfg, matRef }: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial|null) => void }) {
  return (
    <>
      <mesh castShadow>
        <sphereGeometry args={[cfg.rx, 12, 9]} />
        <meshStandardMaterial ref={matRef} color="#6e5c48" roughness={0.94} metalness={0.06}
          emissive={cfg.glow} emissiveIntensity={0.25} />
      </mesh>
      <mesh castShadow position={[cfg.rx * 0.65, -cfg.ry * 0.1, cfg.rx * -0.5]} rotation={[0.3, 1.2, 0.5]}>
        <dodecahedronGeometry args={[cfg.rx * 0.6, 0]} />
        <meshStandardMaterial color="#5a4a38" roughness={0.97} metalness={0.03} />
      </mesh>
      <mesh castShadow position={[-cfg.rx * 0.55, -cfg.ry * 0.2, cfg.rx * 0.4]} rotation={[0.8, -0.4, 0.2]}>
        <dodecahedronGeometry args={[cfg.rx * 0.45, 0]} />
        <meshStandardMaterial color="#705e4a" roughness={0.96} metalness={0.04} />
      </mesh>
    </>
  );
}

function CraterObstacle({ cfg, matRef }: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial|null) => void }) {
  // Flat depression ring — no vertical body, just a wide hazard disc
  return (
    <>
      {/* Dark basalt floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[cfg.rx * 0.75, 36]} />
        <meshStandardMaterial color="#1a1510" roughness={0.99} metalness={0.01} />
      </mesh>
      {/* Raised rim ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[cfg.rx * 0.82, 0.10, 6, 40]} />
        <meshStandardMaterial ref={matRef} color="#6a5a48" roughness={0.93} metalness={0.05}
          emissive={cfg.glow} emissiveIntensity={0.15} />
      </mesh>
      {/* Ejecta scatter (small rocks around rim) */}
      {[0, 72, 144, 216, 288].map((deg, i) => {
        const r  = cfg.rx * 0.9;
        const a  = (deg * Math.PI) / 180;
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;
        return (
          <mesh key={i} castShadow position={[px, 0.05, pz]}>
            <dodecahedronGeometry args={[0.06 + (i % 3) * 0.03, 0]} />
            <meshStandardMaterial color="#7a6a58" roughness={0.96} metalness={0.03} />
          </mesh>
        );
      })}
    </>
  );
}

function DustMound({ cfg, matRef }: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial|null) => void }) {
  // Smooth regolith hemisphere — soft, sandy, no hard edges
  return (
    <>
      <mesh castShadow rotation={[0, 0, 0]}>
        <sphereGeometry args={[cfg.rx, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        <meshStandardMaterial ref={matRef}
          color="#c8a878" roughness={0.99} metalness={0.0}
          emissive={cfg.glow} emissiveIntensity={0.08} />
      </mesh>
      {/* Surface texture bumps */}
      {[-0.18, 0.12, 0.22, -0.08].map((ox, i) => (
        <mesh key={i} position={[ox, cfg.ry * 0.72, (i % 2 === 0 ? 0.14 : -0.12)]}>
          <sphereGeometry args={[0.06 + i * 0.02, 7, 6]} />
          <meshStandardMaterial color="#b8986a" roughness={1.0} metalness={0.0} />
        </mesh>
      ))}
    </>
  );
}

function AntennaDebris({ cfg, matRef }: { cfg: VariantConfig; matRef: (el: THREE.MeshStandardMaterial|null) => void }) {
  // Crashed probe antenna — vertical pole, snapped crossbar, scattered panels
  return (
    <>
      {/* Main mast (slightly tilted — crashed) */}
      <mesh castShadow rotation={[0.25, 0, 0.12]} position={[0, cfg.ry * 0.5, 0]}>
        <cylinderGeometry args={[0.03, 0.05, cfg.ry * 1.8, 8]} />
        <meshStandardMaterial ref={matRef} color="#b0b8c8" metalness={0.85} roughness={0.18}
          emissive={cfg.glow} emissiveIntensity={0.15} />
      </mesh>
      {/* Dish (crumpled flat disc) */}
      <mesh castShadow position={[0.05, cfg.ry * 1.25, 0.1]} rotation={[0.6, 0.4, -0.3]}>
        <cylinderGeometry args={[0.28, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#8090a0" metalness={0.78} roughness={0.28} />
      </mesh>
      {/* Crossbar (fallen) */}
      <mesh castShadow position={[0, 0.06, 0]} rotation={[0, 0.5, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.55, 6]} />
        <meshStandardMaterial color="#a0aab8" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Solar panel debris */}
      <mesh castShadow position={[-0.25, 0.04, 0.08]} rotation={[-0.15, 0.3, 0.1]}>
        <boxGeometry args={[0.38, 0.02, 0.22]} />
        <meshStandardMaterial color="#1a2a5a" metalness={0.75} roughness={0.2}
          emissive="#1a3a8a" emissiveIntensity={0.2} />
      </mesh>
      {/* Blinking status LED */}
      <mesh position={[0.05, cfg.ry * 1.4, 0.1]}>
        <sphereGeometry args={[0.022, 6, 6]} />
        <meshStandardMaterial color="#00aaff" emissive="#00aaff" emissiveIntensity={1.8} />
      </mesh>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ObstacleField() {
  const obstacles = useObstacleStore(s => s.obstacles);
  const removeObs = useObstacleStore(s => s.removeObstacle);

  const matsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    matsRef.current.forEach((mat, i) => {
      if (!mat) return;
      mat.emissiveIntensity = 0.1 + Math.abs(Math.sin(t * 1.8 + i * 1.1)) * 0.4;
    });
  });

  if (!obstacles.length) return null;

  return (
    <>
      {obstacles.map((obs, i) => {
        const cfg    = CONFIGS[obs.variant];
        const isAntenna = obs.variant === 'antenna';
        const isCrater  = obs.variant === 'crater';
        const yPos   = obs.worldPos[1] + (isCrater ? 0 : cfg.ry * (isAntenna ? 0.1 : 1));

        return (
          <group
            key={obs.id}
            position={[obs.worldPos[0], yPos, obs.worldPos[2]]}
            onContextMenu={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              removeObs(obs.id);
            }}
          >
            {/* Variant-specific mesh */}
            {obs.variant === 'boulder-sm'  && <BoulderSm  cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />}
            {obs.variant === 'boulder-md'  && <BoulderMd  cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />}
            {obs.variant === 'boulder-lg'  && <BoulderLg  cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />}
            {obs.variant === 'crater'      && <CraterObstacle cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />}
            {obs.variant === 'dust-mound'  && <DustMound  cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />}
            {obs.variant === 'antenna'     && <AntennaDebris cfg={cfg} matRef={el => { matsRef.current[i] = el; }} />}

            {/* Universal ground hazard ring */}
            <mesh
              position={[0, isCrater ? 0.03 : (-cfg.ry + 0.04), 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[cfg.rx * 0.9, cfg.rx * cfg.ring, 32]} />
              <meshStandardMaterial
                color={cfg.glow}
                emissive={cfg.glow}
                emissiveIntensity={0.9}
                transparent
                opacity={0.45}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
