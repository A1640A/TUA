'use client';
import { useRef, useMemo, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useRoverRefStore } from '@/store/roverRefStore';
import { ROVER_SPEED } from '@/lib/constants';
import RoverClearanceBounds from './RoverClearanceBounds';

// Base Y of wheel group origin relative to chassis ground — from wheelPositions
const BASE_WHEEL_Y = 0.0;

/* ─────────────────────────────────────────────────────────────────────────────
   TUA Lunar Rover — realistic procedural mesh
   Inspired by the Turkish lunar rover concept (6-wheel rocker-bogie design)
   Features: Turkish flag decal, "TÜRKİYE" text panel, robotic arm, RTG,
             high-gain dish antenna, stereo cameras, solar panels.
───────────────────────────────────────────────────────────────────────────── */

/** Thin rectangle helper — used for flag stripes */
function Stripe({
  color,
  position,
  size,
  emissive = 0,
}: {
  color: string;
  position: [number, number, number];
  size: [number, number, number];
  emissive?: number;
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} />
    </mesh>
  );
}

/** Turkish crescent + star decal on a side panel */
function TurkishFlag({ side }: { side: 1 | -1 }) {
  // Flag lives on the Z+ or Z- face of the chassis
  const z = side * 0.46;
  const rot: [number, number, number] = [0, side === 1 ? 0 : Math.PI, 0];

  // Crescent ring points (approximate torus-like shape via thin cylinders)
  const crescentSegments = useMemo(() => {
    const pts: { x: number; y: number; angle: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 1.4 - Math.PI * 0.7 + Math.PI;
      pts.push({ x: Math.cos(angle) * 0.057, y: Math.sin(angle) * 0.057, angle });
    }
    return pts;
  }, []);

  return (
    <group position={[0.1, 0.32, z]} rotation={rot}>
      {/* Red background panel */}
      <mesh>
        <boxGeometry args={[0.55, 0.28, 0.006]} />
        <meshStandardMaterial color="#E30A17" roughness={0.7} metalness={0.1} />
      </mesh>

      {/* White crescent outer circle */}
      <mesh position={[-0.08, 0, 0.004]}>
        <cylinderGeometry args={[0.075, 0.075, 0.006, 24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      {/* Crescent cutout (red circle slightly offset) */}
      <mesh position={[-0.052, 0.009, 0.007]}>
        <cylinderGeometry args={[0.062, 0.062, 0.008, 24]} />
        <meshStandardMaterial color="#E30A17" roughness={0.7} />
      </mesh>

      {/* White star (5-point approximated by thin elongated boxes rotated) */}
      {[0, 72, 144, 216, 288].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <mesh
            key={i}
            position={[0.03 + Math.cos(rad) * 0.001, Math.sin(rad) * 0.001, 0.006]}
            rotation={[Math.PI / 2, 0, rad]}
          >
            <coneGeometry args={[0.014, 0.055, 3]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        );
      })}

      {/* "TÜRKİYE" text panel below flag */}
      <mesh position={[0, -0.19, 0]}>
        <boxGeometry args={[0.55, 0.07, 0.006]} />
        <meshStandardMaterial color="#d0d8e8" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Letter approximations as raised bars — T */}
      {[
        [-0.22, 0, 0], [-0.185, -0.012, 0], [-0.185, 0.012, 0],
        [-0.15, 0, 0],
        [-0.11, 0.01, 0], [-0.11, -0.01, 0],
        [-0.07, 0, 0],
        [-0.03, 0.01, 0], [-0.03, -0.01, 0],
        [0.01, 0, 0],
        [0.05, 0, 0],
        [0.09, 0.01, 0], [0.09, -0.01, 0],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], -0.19 + p[1], 0.006]}>
          <boxGeometry args={[0.018, 0.042, 0.004]} />
          <meshStandardMaterial color="#1a2040" />
        </mesh>
      ))}
    </group>
  );
}

/** Single rocker-bogie wheel with treads detail */
const Wheel = forwardRef<THREE.Group, { position: [number, number, number] }>(function Wheel({ position }, wRef) {
  return (
    <group ref={wRef} position={position}>
      {/* Main tire */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.15, 24]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.98} metalness={0.05} />
      </mesh>
      {/* Tread rings */}
      {[-0.05, 0, 0.05].map((dz, i) => (
        <mesh key={i} position={[0, 0, dz]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.22, 0.018, 6, 24]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.99} />
        </mesh>
      ))}
      {/* Hub */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.085, 0.085, 0.165, 12]} />
        <meshStandardMaterial color="#5a6070" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Hub bolts */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <mesh key={i} position={[0, Math.sin(rad) * 0.055, Math.cos(rad) * 0.055]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.008, 0.008, 0.17, 6]} />
            <meshStandardMaterial color="#88aabb" metalness={0.9} roughness={0.2} />
          </mesh>
        );
      })}
      {/* Emissive hub ring */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.06, 0.006, 6, 18]} />
        <meshStandardMaterial color="#38d4f8" emissive="#38d4f8" emissiveIntensity={1.2} metalness={0.9} />
      </mesh>
    </group>
  );
});

/** Robotic arm with 3 segments */
function RoboticArm({ moving }: { moving: boolean }) {
  const armRef = useRef<THREE.Group>(null);
  const elbow1Ref = useRef<THREE.Group>(null);
  const elbow2Ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (armRef.current) {
      armRef.current.rotation.z = moving
        ? Math.sin(t * 1.2) * 0.15 - 0.3
        : Math.sin(t * 0.4) * 0.08 - 0.25;
    }
    if (elbow1Ref.current) {
      elbow1Ref.current.rotation.z = moving
        ? Math.sin(t * 1.5 + 1) * 0.2 - 0.4
        : Math.sin(t * 0.35 + 0.5) * 0.1 - 0.3;
    }
    if (elbow2Ref.current) {
      elbow2Ref.current.rotation.z = moving
        ? Math.sin(t * 1.8 + 2) * 0.15
        : 0.2;
    }
  });

  return (
    <group position={[0.5, 0.48, -0.25]} ref={armRef}>
      {/* Shoulder joint */}
      <mesh>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color="#8899aa" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Upper arm */}
      <mesh position={[0.18, 0.06, 0]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.32, 0.038, 0.038]} />
        <meshStandardMaterial color="#99aabb" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* Elbow 1 */}
      <group ref={elbow1Ref} position={[0.36, 0.1, 0]}>
        <mesh>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color="#8899aa" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Forearm */}
        <mesh position={[0.14, -0.04, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.26, 0.03, 0.03]} />
          <meshStandardMaterial color="#99aabb" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* Elbow 2 / wrist */}
        <group ref={elbow2Ref} position={[0.28, -0.06, 0]}>
          <mesh>
            <sphereGeometry args={[0.028, 8, 8]} />
            <meshStandardMaterial color="#8899aa" metalness={0.9} roughness={0.2} />
          </mesh>
          {/* End effector / drill tool */}
          <mesh position={[0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.012, 0.14, 8]} />
            <meshStandardMaterial color="#aabbcc" metalness={0.95} roughness={0.1} />
          </mesh>
          {/* Drill bit emissive tip */}
          <mesh position={[0.14, 0, 0]}>
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={1.5} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function PlaceholderRover({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  /* ── Refs ──────────────────────────────────────────────────────────── */
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef  = useRef<THREE.Mesh>(null);

  /* ── roverRefStore — share world matrix with FPV mini canvas ─────────── */
  const setRoverMatrix = useRoverRefStore(s => s.setRoverMatrix);
  const _matrixArr = useRef(new Float32Array(16));

  // 6 wheels: FL FM FR  RL RM RR
  const wFL = useRef<THREE.Group>(null);
  const wFM = useRef<THREE.Group>(null);
  const wFR = useRef<THREE.Group>(null);
  const wRL = useRef<THREE.Group>(null);
  const wRM = useRef<THREE.Group>(null);
  const wRR = useRef<THREE.Group>(null);
  const wheels = [wFL, wFM, wFR, wRL, wRM, wRR];

  const mastRef    = useRef<THREE.Group>(null);
  const dishRef    = useRef<THREE.Group>(null);

  /* ── Store ─────────────────────────────────────────────────────────── */
  const status       = useSimulationStore(s => s.status);
  const wheelHeights = useSimulationStore(s => s.roverState.wheelHeights);
  const roverPos     = useSimulationStore(s => s.roverState.position);
  const showClearanceBounds = useSimulationStore(s => s.showClearanceBounds);
  const moving       = status === 'animating';

  /* ── Animation ─────────────────────────────────────────────────────── */
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // ── Publish world matrix to roverRefStore ────────────────────────────
    // FPVCamera in the second Canvas reads this every frame to position itself.
    if (groupRef.current) {
      groupRef.current.updateWorldMatrix(true, false);
      groupRef.current.matrixWorld.toArray(_matrixArr.current);
      setRoverMatrix(
        _matrixArr.current,
        [
          groupRef.current.matrixWorld.elements[12],
          groupRef.current.matrixWorld.elements[13],
          groupRef.current.matrixWorld.elements[14],
        ],
      );
    }

    // Wheel spin (all 6)
    const spinDelta = moving ? ROVER_SPEED * 6.5 : 0;
    wheels.forEach(w => {
      if (w.current) w.current.rotation.x -= spinDelta;
    });

    // ── Per-wheel suspension offsets ────────────────────────────────────
    // wheelHeights = [yFL, yFR, yRL, yRR] — terrain contact Y for each corner.
    // Chassis centre Y = roverPos[1] (already LERP-smoothed in useRoverAnimation).
    // Each wheel's local Y = (terrainY - chassisCentreY) + BASE_WHEEL_Y
    // This makes each wheel 'press down' onto its local terrain patch.
    if (moving && wheelHeights) {
      const chassisY = roverPos[1];
      const [yFL, yFR, yRL, yRR] = wheelHeights;

      // Clamp offset to ±0.35 to avoid extreme suspension travel
      const clamp = (v: number) => Math.max(-0.35, Math.min(0.35, v));

      // FL wheel (index 0 in wheelPositions[0])
      if (wFL.current) wFL.current.position.y = clamp(yFL - chassisY) + BASE_WHEEL_Y;
      // FM (middle-left): average of FL and RL
      if (wFM.current) wFM.current.position.y = clamp((yFL + yRL) * 0.5 - chassisY) + BASE_WHEEL_Y;
      // RL (rear-left, index 2)
      if (wRL.current) wRL.current.position.y = clamp(yRL - chassisY) + BASE_WHEEL_Y;
      // FR (front-right, index 3)
      if (wFR.current) wFR.current.position.y = clamp(yFR - chassisY) + BASE_WHEEL_Y;
      // RM (middle-right): average of FR and RR
      if (wRM.current) wRM.current.position.y = clamp((yFR + yRR) * 0.5 - chassisY) + BASE_WHEEL_Y;
      // RR (rear-right, index 5)
      if (wRR.current) wRR.current.position.y = clamp(yRR - chassisY) + BASE_WHEEL_Y;
    } else {
      // Reset wheel positions when stationary
      wheels.forEach(w => { if (w.current) w.current.position.y = BASE_WHEEL_Y; });
    }

    // Body micro-vibration (only cosmetic, very subtle when kinematic LERP is active)
    if (bodyRef.current) {
      bodyRef.current.rotation.z = moving ? Math.sin(t * 7) * 0.006 : 0;
      bodyRef.current.rotation.x = moving ? Math.sin(t * 5 + 1) * 0.004 : 0;
    }

    // Stereo camera mast pan — always animate (FPV now in separate canvas)
    if (mastRef.current) {
      mastRef.current.rotation.y = Math.sin(t * 0.6) * Math.PI * 0.3;
    }

    // Dish antenna slow track
    if (dishRef.current) {
      dishRef.current.rotation.y = Math.sin(t * 0.2) * 0.4;
      dishRef.current.rotation.x = -0.5 + Math.sin(t * 0.15) * 0.1;
    }
  });

  /* ── Wheel positions: [left/right offset, height, front/back] */
  const wheelPositions: [number, number, number][] = [
    [-0.72, 0.0, -0.72], // FL
    [-0.72, 0.0,  0.0 ], // FM
    [-0.72, 0.0,  0.72], // RL
    [ 0.72, 0.0, -0.72], // FR
    [ 0.72, 0.0,  0.0 ], // FM
    [ 0.72, 0.0,  0.72], // RR
  ];

  return (
    <group ref={groupRef} position={position} rotation={rotation}>

      {/* ── Chassis frame (rocker-bogie beams) ───────────────────────── */}
      {/* Left rocker beam */}
      <mesh position={[-0.72, 0.18, 0]} castShadow>
        <boxGeometry args={[0.07, 0.06, 1.5]} />
        <meshStandardMaterial color="#7a8898" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Right rocker beam */}
      <mesh position={[0.72, 0.18, 0]} castShadow>
        <boxGeometry args={[0.07, 0.06, 1.5]} />
        <meshStandardMaterial color="#7a8898" metalness={0.85} roughness={0.3} />
      </mesh>
      {/* Cross-beams */}
      {[-0.62, 0, 0.62].map((z, i) => (
        <mesh key={i} position={[0, 0.12, z]}>
          <boxGeometry args={[1.44, 0.05, 0.06]} />
          <meshStandardMaterial color="#6a7888" metalness={0.8} roughness={0.35} />
        </mesh>
      ))}

      {/* ── Main body / chassis box ──────────────────────────────────── */}
      <mesh ref={bodyRef} position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[1.15, 0.38, 0.92]} />
        <meshStandardMaterial color="#c4cdd8" metalness={0.6} roughness={0.32} />
      </mesh>

      {/* Body front angled plate */}
      <mesh position={[0, 0.44, -0.52]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[1.1, 0.38, 0.08]} />
        <meshStandardMaterial color="#b8c2cc" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Belly armor */}
      <mesh position={[0, 0.28, 0]}>
        <boxGeometry args={[1.1, 0.04, 0.9]} />
        <meshStandardMaterial color="#8899aa" metalness={0.75} roughness={0.4} />
      </mesh>

      {/* ── Turkish Flag panels (both sides) ─────────────────────────── */}
      <TurkishFlag side={1} />
      <TurkishFlag side={-1} />

      {/* ── Solar panels (top, 3 sections) ──────────────────────────── */}
      {/* Center */}
      <mesh position={[0, 0.67, 0]}>
        <boxGeometry args={[0.9, 0.03, 0.88]} />
        <meshStandardMaterial
          color="#0d2550" metalness={0.9} roughness={0.15}
          emissive="#0d184a" emissiveIntensity={0.5}
        />
      </mesh>
      {/* Left wing */}
      <mesh position={[-0.72, 0.67, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.52, 0.025, 0.88]} />
        <meshStandardMaterial
          color="#0a1e45" metalness={0.92} roughness={0.12}
          emissive="#0a1535" emissiveIntensity={0.6}
        />
      </mesh>
      {/* Right wing */}
      <mesh position={[0.72, 0.67, 0]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.52, 0.025, 0.88]} />
        <meshStandardMaterial
          color="#0a1e45" metalness={0.92} roughness={0.12}
          emissive="#0a1535" emissiveIntensity={0.6}
        />
      </mesh>
      {/* Solar panel grid lines */}
      {[-0.3, 0, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0.68, 0]}>
          <boxGeometry args={[0.01, 0.006, 0.88]} />
          <meshStandardMaterial color="#1a3a7a" />
        </mesh>
      ))}
      {[-0.3, 0, 0.3].map((z, i) => (
        <mesh key={i} position={[0, 0.68, z]}>
          <boxGeometry args={[0.9, 0.006, 0.01]} />
          <meshStandardMaterial color="#1a3a7a" />
        </mesh>
      ))}

      {/* ── Stereo camera mast ───────────────────────────────────────── */}
      {/* Mast pole */}
      <mesh position={[0.25, 0.95, 0.15]}>
        <cylinderGeometry args={[0.028, 0.035, 0.65, 10]} />
        <meshStandardMaterial color="#99aabb" metalness={0.92} roughness={0.18} />
      </mesh>
      {/* Camera head assembly */}
      <group ref={mastRef} position={[0.25, 1.3, 0.15]}>
        <mesh>
          <boxGeometry args={[0.18, 0.1, 0.12]} />
          <meshStandardMaterial color="#c0ccd8" metalness={0.75} roughness={0.25} />
        </mesh>
        {/* Left lens */}
        <mesh position={[0, 0, -0.07]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.04, 12]} />
          <meshStandardMaterial color="#111122" metalness={0.5} roughness={0.1} />
        </mesh>
        {/* Right lens */}
        <mesh position={[0, 0, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.04, 12]} />
          <meshStandardMaterial color="#111122" metalness={0.5} roughness={0.1} />
        </mesh>
        {/* Lens glow left */}
        <mesh position={[0.035, 0, -0.07]}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshStandardMaterial color="#00eeff" emissive="#00eeff" emissiveIntensity={2.5} />
        </mesh>
        {/* Lens glow right */}
        <mesh position={[0.035, 0, 0.07]}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshStandardMaterial color="#00eeff" emissive="#00eeff" emissiveIntensity={2.5} />
        </mesh>
      </group>

      {/* ── High-Gain Dish Antenna ────────────────────────────────────── */}
      <group ref={dishRef} position={[-0.25, 0.78, 0.25]}>
        {/* Antenna pole */}
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.28, 8]} />
          <meshStandardMaterial color="#aabbcc" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Dish */}
        <mesh position={[0, 0.32, 0]} rotation={[0.6, 0, 0]}>
          <coneGeometry args={[0.2, 0.08, 16, 1, true]} />
          <meshStandardMaterial
            color="#d4dce8" metalness={0.95} roughness={0.08}
            side={THREE.BackSide}
          />
        </mesh>
        <mesh position={[0, 0.32, 0]} rotation={[0.6, 0, 0]}>
          <coneGeometry args={[0.2, 0.08, 16, 1, true]} />
          <meshStandardMaterial color="#b8c4d0" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* Feed horn */}
        <mesh position={[0, 0.38, 0.04]} rotation={[0.6, 0, 0]}>
          <cylinderGeometry args={[0.012, 0.018, 0.06, 8]} />
          <meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={0.8} metalness={0.9} />
        </mesh>
      </group>

      {/* ── RTG power unit (rear) ─────────────────────────────────────── */}
      <mesh position={[-0.45, 0.38, 0.6]}>
        <boxGeometry args={[0.18, 0.24, 0.18]} />
        <meshStandardMaterial
          color="#6a7280" metalness={0.75} roughness={0.45}
          emissive="#ff5010" emissiveIntensity={0.2}
        />
      </mesh>
      {/* RTG cooling fins */}
      {[-0.05, 0, 0.05].map((dz, i) => (
        <mesh key={i} position={[-0.55, 0.38, 0.6 + dz]}>
          <boxGeometry args={[0.2, 0.01, 0.01]} />
          <meshStandardMaterial color="#5a6270" metalness={0.9} />
        </mesh>
      ))}

      {/* ── Science instrument box (front) ───────────────────────────── */}
      <mesh position={[0.35, 0.36, -0.52]}>
        <boxGeometry args={[0.22, 0.14, 0.1]} />
        <meshStandardMaterial color="#bbc8d4" metalness={0.65} roughness={0.3} />
      </mesh>
      {/* Spectrometer port */}
      <mesh position={[0.35, 0.36, -0.578]}>
        <cylinderGeometry args={[0.03, 0.03, 0.04, 10]} />
        <meshStandardMaterial color="#222233" metalness={0.5} roughness={0.1} />
      </mesh>
      <mesh position={[0.35, 0.36, -0.575]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#ff8800" emissive="#ff8800" emissiveIntensity={1.8} />
      </mesh>

      {/* ── Navigation hazard lights ──────────────────────────────────── */}
      <mesh position={[ 0.52, 0.32, -0.48]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshStandardMaterial color="#ff3300" emissive="#ff3300" emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[-0.52, 0.32, -0.48]}>
        <sphereGeometry args={[0.022, 8, 8]} />
        <meshStandardMaterial color="#ff3300" emissive="#ff3300" emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[ 0.52, 0.32,  0.48]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[-0.52, 0.32,  0.48]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={1.5} />
      </mesh>

      {/* ── Suspension strut connectors ──────────────────────────────── */}
      {[-0.72, 0.72].map((x, xi) =>
        [-0.62, 0, 0.62].map((z, zi) => (
          <mesh key={`strut-${xi}-${zi}`} position={[x * 0.86, 0.16, z]} rotation={[0, 0, x > 0 ? -0.4 : 0.4]}>
            <boxGeometry args={[0.25, 0.04, 0.035]} />
            <meshStandardMaterial color="#7a8898" metalness={0.85} roughness={0.3} />
          </mesh>
        ))
      )}

      {/* ── 6 Wheels ─────────────────────────────────────────────────── */}
      <Wheel ref={wFL} position={wheelPositions[0]} />
      <Wheel ref={wFM} position={wheelPositions[1]} />
      <Wheel ref={wFR} position={wheelPositions[2]} />
      <Wheel ref={wRL} position={wheelPositions[3]} />
      <Wheel ref={wRM} position={wheelPositions[4]} />
      <Wheel ref={wRR} position={wheelPositions[5]} />

      {/* ── Robotic arm ──────────────────────────────────────────────── */}
      <RoboticArm moving={moving} />

      {/* ── True Clearance A* bounding-box visualizer ─────────────────
          Shows judges the exact (2·RoverClearanceRadius+1)² C-Space kernel
          that prevents wheel-clipping in the A* backend.                 */}
      <RoverClearanceBounds visible={showClearanceBounds} />

      {/* ── Status LED strip on body edge ────────────────────────────── */}
      <mesh position={[0, 0.28, -0.46]}>
        <boxGeometry args={[0.9, 0.018, 0.008]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={1.0} />
      </mesh>

    </group>
  );
}
