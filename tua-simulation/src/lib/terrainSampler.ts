/**
 * terrainSampler.ts — CPU-side Height & Normal Sampler
 *
 * ════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS
 * ════════════════════════════════════════════════════════════════════════
 *  The displacementMap (GPU shader) displaces vertices only on the GPU.
 *  A CPU-side Raycaster still sees the ORIGINAL flat geometry — so the
 *  rover would hover above or clip through craters.
 *
 *  This module solves the problem at the architecture level:
 *    • The heightMap Float32Array lives on the CPU — same data MoonTerrain
 *      uses to bake vertex Y in MoonTerrain.tsx.
 *    • getHeightAt(x, z)  — returns the EXACT world-Y the visual mesh has.
 *    • getNormalAt(x, z)  — 3-point finite difference surface normal.
 *
 *  Neither function uses Three.js Raycaster. No GPU round-trip needed.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  COORDINATE SYSTEM
 * ════════════════════════════════════════════════════════════════════════
 *  World  X ∈ [-TERRAIN_SCALE/2, +TERRAIN_SCALE/2]
 *  World  Z ∈ [-TERRAIN_SCALE/2, +TERRAIN_SCALE/2]
 *  World  Y = elevation (up)
 *
 *  HeightMap indices: row-major [z * GRID_SIZE + x], values 0..1 (normalised).
 *  Full world-Y = normalised * TERRAIN_HEIGHT_SCALE + sphereDip(wx, wz)
 * ════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { TERRAIN_SCALE, TERRAIN_HEIGHT_SCALE, GRID_SIZE } from '@/lib/constants';

// ─── Internal constants (must match MoonTerrain.tsx) ─────────────────────────

/** Virtual sphere radius for the planetary-curve bake (matches MoonTerrain). */
const SPHERE_RADIUS = 580;

/**
 * Finite-difference step size used by getNormalAt().
 * Larger → smoother normals (averages more terrain).
 * Smaller → sharper crater-edge normals.
 * 0.25 world units ≈ 0.4 grid cells at TERRAIN_SCALE=80, GRID_SIZE=128.
 */
const NORMAL_DELTA = 0.25;

// ─── Pre-allocated scratch objects (zero GC per frame) ────────────────────────

const _v0 = new THREE.Vector3();
const _vX = new THREE.Vector3();
const _vZ = new THREE.Vector3();
const _dX = new THREE.Vector3();
const _dZ = new THREE.Vector3();
const _n  = new THREE.Vector3();

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Sphere-curvature dip at horizontal world position (wx, wz).
 * Returns a NEGATIVE value (the surface bows downward away from centre).
 */
function sphereDip(wx: number, wz: number): number {
  const r2 = wx * wx + wz * wz;
  return -(SPHERE_RADIUS - Math.sqrt(Math.max(0, SPHERE_RADIUS * SPHERE_RADIUS - r2)));
}

/**
 * Bilinear sample of the normalised height map at world position (wx, wz).
 * Returns a value in [0, 1].
 */
function sampleNorm(
  hm: Float32Array | readonly number[],
  wx: number,
  wz: number,
): number {
  const half = TERRAIN_SCALE / 2;
  const u  = Math.max(0, Math.min(1, (wx + half) / TERRAIN_SCALE));
  const v  = Math.max(0, Math.min(1, (wz + half) / TERRAIN_SCALE));
  const gx = u * (GRID_SIZE - 1);
  const gz = v * (GRID_SIZE - 1);
  const x0 = Math.floor(gx);
  const x1 = Math.min(x0 + 1, GRID_SIZE - 1);
  const z0 = Math.floor(gz);
  const z1 = Math.min(z0 + 1, GRID_SIZE - 1);
  const fx = gx - x0;
  const fz = gz - z0;
  const h00 = hm[z0 * GRID_SIZE + x0] ?? 0;
  const h10 = hm[z0 * GRID_SIZE + x1] ?? 0;
  const h01 = hm[z1 * GRID_SIZE + x0] ?? 0;
  const h11 = hm[z1 * GRID_SIZE + x1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz)
       + (h01 * (1 - fx) + h11 * fx) * fz;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * getHeightAt — world-Y elevation at (wx, wz).
 *
 * Returns the EXACT same value that MoonTerrain.tsx bakes into vertex Y,
 * so the rover sits flush with the visual surface at all times.
 *
 * Formula:  Y = normalised_sample × TERRAIN_HEIGHT_SCALE + sphereDip(wx, wz)
 *
 * @param hm   The terrain heightMap Float32Array from terrainStore.
 * @param wx   World X coordinate.
 * @param wz   World Z coordinate.
 * @returns    World Y (elevation, up).
 */
export function getHeightAt(
  hm: Float32Array | readonly number[],
  wx: number,
  wz: number,
): number {
  return sampleNorm(hm, wx, wz) * TERRAIN_HEIGHT_SCALE + sphereDip(wx, wz);
}

/**
 * getNormalAt — surface normal at (wx, wz) using 3-point finite difference.
 *
 * Algorithm:
 *   p0 = (wx,         getHeightAt(wx,         wz        ), wz        )
 *   pX = (wx + delta, getHeightAt(wx + delta, wz        ), wz        )
 *   pZ = (wx,         getHeightAt(wx,         wz + delta), wz + delta)
 *
 *   dX = pX - p0   (tangent in +X direction)
 *   dZ = pZ - p0   (tangent in +Z direction)
 *
 *   normal = dZ × dX   (cross product — right-hand rule gives UP on a
 *                        surface that slopes +Y in +X and +Z, which is
 *                        the physical lunar terrain orientation)
 *
 * The result is normalised. If the cross product degenerates (flat terrain),
 * returns world-up (0, 1, 0) as a safe fallback.
 *
 * @param hm    The terrain heightMap Float32Array.
 * @param wx    World X coordinate.
 * @param wz    World Z coordinate.
 * @param delta Finite-difference step size (default NORMAL_DELTA = 0.25 m).
 * @returns     Normalised surface-normal THREE.Vector3 (reused scratch — clone if stored).
 */
export function getNormalAt(
  hm: Float32Array | readonly number[],
  wx: number,
  wz: number,
  delta: number = NORMAL_DELTA,
): THREE.Vector3 {
  const y0 = getHeightAt(hm, wx,         wz        );
  const yX = getHeightAt(hm, wx + delta, wz        );
  const yZ = getHeightAt(hm, wx,         wz + delta);

  _v0.set(wx,         y0, wz        );
  _vX.set(wx + delta, yX, wz        );
  _vZ.set(wx,         yZ, wz + delta);

  _dX.subVectors(_vX, _v0);  // tangent in +X
  _dZ.subVectors(_vZ, _v0);  // tangent in +Z

  // dZ × dX  →  normal pointing up for standard orientation
  _n.crossVectors(_dZ, _dX).normalize();

  // Degenerate guard: if Y component is negative or near-zero, return world-up
  if (!isFinite(_n.x) || !isFinite(_n.y) || _n.y < 0.05) {
    _n.set(0, 1, 0);
  }

  return _n;
}

/**
 * Convenience: getHeightAt wrapped to accept a nullable heightMap.
 * Returns 0 when no terrain is loaded yet.
 */
export function safeGetHeightAt(
  hm: Float32Array | readonly number[] | null | undefined,
  wx: number,
  wz: number,
): number {
  if (!hm) return 0;
  return getHeightAt(hm, wx, wz);
}
