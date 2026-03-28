'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * SpaceEnvironment — rich, animated deep-space backdrop.
 *
 * Layers (back → front):
 *  1. NebulaBackdrop  — large distant sphere with a painted nebula gradient
 *     achieved through vertex-colour interpolation across the sphere interior.
 *  2. StarLayer (×3)  — three point-cloud layers at different distances,
 *     sizes and drift speeds to give true parallax depth.
 *  3. MilkyWayBand    — a tilted disc of denser, dimmer stars simulating
 *     the galactic plane smear.
 *  4. EarthInSky      — slowly-rotating blue Earth visible on the horizon.
 *  5. SunGlare        — a distant bright point with lens-glow halo.
 */

// ─── Seeded PRNG for deterministic geometry ───────────────────────────────────
function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── 1. Nebula Backdrop ───────────────────────────────────────────────────────
function NebulaBackdrop() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(480, 64, 64);
    const pos    = g.attributes.position as THREE.BufferAttribute;
    const count  = pos.count;
    const colors = new Float32Array(count * 3);
    const rng    = seededRng(77);

    // Colour palette: deep midnight → violet nebula → warm gold dust
    const midnight = new THREE.Color('#03040e');
    const violet   = new THREE.Color('#1a0835');
    const teal     = new THREE.Color('#051a28');
    const gold     = new THREE.Color('#1a0f02');
    const tmp      = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const y   = pos.getY(i);
      const nx  = (pos.getX(i) / 480 + 1) / 2;
      const ny  = (y / 480 + 1) / 2;
      const t1  = Math.max(0, Math.min(1, ny * 1.6));
      const t2  = Math.max(0, Math.min(1, nx * 1.4 - 0.2));
      const neb = rng() * 0.12; // subtle random brightening

      tmp.lerpColors(midnight, violet, t1 * 0.6 + neb);
      tmp.lerpColors(tmp, teal, (1 - t1) * 0.4);
      tmp.lerpColors(tmp, gold, Math.max(0, t2 - 0.5) * 0.4);

      colors[i * 3]     = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  return <mesh geometry={geo} material={mat} />;
}

// ─── 2. Star Layer ────────────────────────────────────────────────────────────
interface StarLayerProps {
  count:    number;
  radius:   number;
  size:     number;
  speed:    number;
  seed:     number;
  opacity:  number;
  color:    string;
}

function StarLayer({ count, radius, size, speed, seed, opacity, color }: StarLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const rotAxis   = useMemo(() => new THREE.Vector3(0.15, 1, 0.05).normalize(), []);

  const geo = useMemo(() => {
    const rng  = seededRng(seed);
    const pos  = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Fibonacci sphere distribution for even spread
      const theta = Math.acos(1 - 2 * rng());
      const phi   = 2 * Math.PI * rng();
      const r     = radius * (0.8 + rng() * 0.2);
      pos[i * 3]     = r * Math.sin(theta) * Math.cos(phi);
      pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      pos[i * 3 + 2] = r * Math.cos(theta);
      sizes[i] = size * (0.5 + rng() * 1.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [count, radius, size, seed]);

  const mat = useMemo(() => new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent:     true,
    opacity,
    depthWrite:      false,
    blending:        THREE.AdditiveBlending,
  }), [color, size, opacity]);

  useFrame((_, dt) => {
    if (pointsRef.current) {
      pointsRef.current.rotateOnAxis(rotAxis, dt * speed);
    }
  });

  return <points ref={pointsRef} geometry={geo} material={mat} />;
}

// ─── 3. Milky Way Band ────────────────────────────────────────────────────────
function MilkyWayBand() {
  const geo = useMemo(() => {
    const rng   = seededRng(99);
    const count = 3200;
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Disc arc — concentrated in a tilted ring ±25° wide
      const angle    = rng() * Math.PI * 2;
      const spread   = (rng() - 0.5) * 0.5; // radians off the plane
      const r        = 280 + rng() * 120;
      pos[i * 3]     = r * Math.cos(angle);
      pos[i * 3 + 1] = r * Math.sin(spread) * 0.3;
      pos[i * 3 + 2] = r * Math.sin(angle);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  const mat = useMemo(() => new THREE.PointsMaterial({
    color:           '#c8d8ff',
    size:            0.6,
    sizeAttenuation: true,
    transparent:     true,
    opacity:         0.25,
    depthWrite:      false,
    blending:        THREE.AdditiveBlending,
  }), []);

  return (
    <points
      geometry={geo}
      material={mat}
      rotation={[0.42, 0.6, 0.1]}  // tilt to match classic Milky Way angle
    />
  );
}

// ─── 4. Earth In Sky ─────────────────────────────────────────────────────────
function EarthInSky() {
  const groupRef = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);

  // Slow axial rotation + cloud layer counter-rotation
  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 0.025;
    if (cloudRef.current) cloudRef.current.rotation.y -= dt * 0.010;
  });

  return (
    <group ref={groupRef} position={[-60, 52, -155]}>
      {/* Atmosphere glow ring */}
      <mesh>
        <sphereGeometry args={[11.2, 40, 40]} />
        <meshStandardMaterial
          color="#1565d4"
          emissive="#0a3db5"
          emissiveIntensity={0.35}
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Ocean / land base */}
      <mesh castShadow>
        <sphereGeometry args={[10, 48, 48]} />
        <meshStandardMaterial
          color="#1a5fbb"
          emissive="#0a2a6a"
          emissiveIntensity={0.30}
          roughness={0.65}
          metalness={0.08}
        />
      </mesh>

      {/* Continent patches — irregular raised shapes */}
      {[
        { pos: [-3,  7,  7] as [number,number,number], r: 3.8, rot: [0.3, 0.5, 0.1] as [number,number,number] },
        { pos: [ 6,  2, -7] as [number,number,number], r: 3.2, rot: [0.8,-0.3, 0.4] as [number,number,number] },
        { pos: [-5, -5,  8] as [number,number,number], r: 2.8, rot: [0.1, 0.9,-0.2] as [number,number,number] },
        { pos: [ 3, -8, -4] as [number,number,number], r: 2.2, rot: [0.5,-0.7, 0.6] as [number,number,number] },
      ].map((c, i) => (
        <mesh key={i} position={c.pos} rotation={c.rot}>
          <sphereGeometry args={[c.r, 12, 12]} />
          <meshStandardMaterial
            color="#3d7a35"
            roughness={0.88}
            metalness={0.02}
          />
        </mesh>
      ))}

      {/* Cloud layer */}
      <mesh ref={cloudRef}>
        <sphereGeometry args={[10.35, 36, 36]} />
        <meshStandardMaterial
          color="#ddeeff"
          transparent
          opacity={0.28}
          roughness={1}
          metalness={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ─── 5. Sun Glare ─────────────────────────────────────────────────────────────
function SunGlare() {
  const haloRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (haloRef.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 0.8) * 0.04;
      haloRef.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[240, 130, -320]}>
      {/* Core white disc */}
      <mesh>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial color="#fffde8" />
      </mesh>
      {/* Soft corona */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[14, 16, 16]} />
        <meshBasicMaterial
          color="#fff5a0"
          transparent
          opacity={0.12}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Outer diffuse halo */}
      <mesh>
        <sphereGeometry args={[30, 12, 12]} />
        <meshBasicMaterial
          color="#ffe060"
          transparent
          opacity={0.04}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function SpaceEnvironment() {
  return (
    <>
      <NebulaBackdrop />

      {/* Far dim tiny stars */}
      <StarLayer count={5000} radius={420} size={0.40} speed={0.006} seed={11} opacity={0.65} color="#b8caff" />
      {/* Mid-layer blue-white stars */}
      <StarLayer count={2800} radius={350} size={0.65} speed={0.010} seed={22} opacity={0.80} color="#dce8ff" />
      {/* Near bright accent stars */}
      <StarLayer count={600}  radius={280} size={1.10} speed={0.014} seed={33} opacity={0.90} color="#ffffff" />

      <MilkyWayBand />
      <EarthInSky />
      <SunGlare />
    </>
  );
}
