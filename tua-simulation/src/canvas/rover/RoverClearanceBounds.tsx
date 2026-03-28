'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TERRAIN_SCALE, GRID_SIZE, ROVER_CLEARANCE_RADIUS } from '@/lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// RoverClearanceBounds
//
// Renders two overlapping visual proofs of the True Clearance A* footprint:
//
//  1. Animated holographic wireframe cube  (exact C-Space bounding box)
//  2. Faint ground-plane ring / disc       (footprint projection for judges)
//
// The box side-length is derived from ROVER_CLEARANCE_RADIUS using the same
// formula as the C# backend:  side = (2 * radius + 1)  grid cells,
// then scaled to world-space via TERRAIN_SCALE / GRID_SIZE.
//
// Props:
//   visible  – mirrors showClearanceBounds from the simulation store.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
}

// ── Derived world-space dimensions ────────────────────────────────────────────
// One grid cell in world-space:
const CELL_SIZE        = TERRAIN_SCALE / GRID_SIZE;
// Clearance diameter = (2·radius + 1) cells
const CLEARANCE_CELLS  = 2 * ROVER_CLEARANCE_RADIUS + 1;
// World-space half-side (used for the box geometry)
const HALF_SIDE        = (CLEARANCE_CELLS * CELL_SIZE) / 2;
// Full box width/depth:
const BOX_SIDE         = CLEARANCE_CELLS * CELL_SIZE;
// Box height covers the rover from below ground to top of mast (~1.4 m world)
const BOX_HEIGHT       = 1.6;

export default function RoverClearanceBounds({ visible }: Props) {
  const boxRef    = useRef<THREE.LineSegments>(null);
  const ringRef   = useRef<THREE.Mesh>(null);
  const pulseRef  = useRef<THREE.Mesh>(null);

  // ── Wireframe box geometry — edge segments only ───────────────────────────
  const boxGeometry = useMemo(() => {
    const geo = new THREE.BoxGeometry(BOX_SIDE, BOX_HEIGHT, BOX_SIDE);
    return new THREE.EdgesGeometry(geo);
  }, []);

  // ── Ground ring geometry ──────────────────────────────────────────────────
  const ringGeometry = useMemo(
    () => new THREE.RingGeometry(HALF_SIDE - 0.04, HALF_SIDE + 0.04, 64),
    [],
  );

  // ── Pulse disc ────────────────────────────────────────────────────────────
  const pulseGeometry = useMemo(
    () => new THREE.CircleGeometry(HALF_SIDE, 64),
    [],
  );

  // ── Animation ─────────────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    if (!visible) return;
    const t = clock.getElapsedTime();

    // Gently breathe the box opacity
    if (boxRef.current) {
      (boxRef.current.material as THREE.LineBasicMaterial).opacity =
        0.55 + Math.sin(t * 2.4) * 0.25;
    }

    // Pulse disc fades in and out more slowly
    if (pulseRef.current) {
      const m = pulseRef.current.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, Math.sin(t * 1.1) * 0.08);
    }

    // Ring slow rotation
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.3;
    }
  });

  if (!visible) return null;

  // Box is centred at rover origin; lift by half height so it sits above ground.
  const boxY = BOX_HEIGHT / 2 - 0.1;

  return (
    <group name="clearance-bounds">
      {/* ── Holographic wireframe bounding box ─────────────────────────── */}
      <lineSegments ref={boxRef} geometry={boxGeometry} position={[0, boxY, 0]}>
        <lineBasicMaterial
          color="#00ffcc"
          transparent
          opacity={0.65}
          depthWrite={false}
          depthTest={false}
        />
      </lineSegments>

      {/* ── Corner tick marks (axis-aligned cross-hairs at each corner) ── */}
      {([-1, 1] as const).flatMap((sx) =>
        ([-1, 1] as const).map((sz) => (
          <group
            key={`tick-${sx}-${sz}`}
            position={[sx * HALF_SIDE, 0.02, sz * HALF_SIDE]}
          >
            {/* X-axis tick */}
            <mesh>
              <boxGeometry args={[0.22, 0.025, 0.025]} />
              <meshBasicMaterial color="#00ffcc" transparent opacity={0.9} />
            </mesh>
            {/* Z-axis tick */}
            <mesh>
              <boxGeometry args={[0.025, 0.025, 0.22]} />
              <meshBasicMaterial color="#00ffcc" transparent opacity={0.9} />
            </mesh>
          </group>
        )),
      )}

      {/* ── Ground-plane projected ring ─────────────────────────────────── */}
      <mesh
        ref={ringRef}
        geometry={ringGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
      >
        <meshBasicMaterial
          color="#00ffcc"
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Pulsing translucent fill disc ───────────────────────────────── */}
      <mesh
        ref={pulseRef}
        geometry={pulseGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.015, 0]}
      >
        <meshBasicMaterial
          color="#00ffcc"
          transparent
          opacity={0.04}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Label: "CLEARANCE RADIUS: ${ROVER_CLEARANCE_RADIUS} cells" ────
          Rendered as a simple billboard plane lined with two indicator bars.   */}
      <group position={[HALF_SIDE + 0.08, BOX_HEIGHT + 0.05, 0]}>
        {/* Horizontal rule */}
        <mesh position={[-0.18, 0, 0]}>
          <boxGeometry args={[0.36, 0.014, 0.014]} />
          <meshBasicMaterial color="#00ffcc" />
        </mesh>
        {/* Vertical bar */}
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.014, 0.3, 0.014]} />
          <meshBasicMaterial color="#00ffcc" transparent opacity={0.7} />
        </mesh>
      </group>
    </group>
  );
}
