/**
 * rockUtils.ts — shared utilities for photorealistic lunar boulder meshes.
 *
 * Three exports:
 *   displaceMesh   — destructively displaces every vertex of an IcosahedronGeometry
 *                    along its normal using deterministic Simplex noise, producing
 *                    the jagged, fractured silhouette of real lunar basalt.
 *
 *   buildNormalMap — generates a 256×256 THREE.Texture from a canvas-painted
 *                    bump pattern.  No external file asset needed.
 *
 *   makeLunarRockMaterial — creates a MeshStandardMaterial configured for a
 *                    dusty, matte, photorealistic lunar rock surface.
 */

import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

// ─── Shared noise instances (one per "frequency layer") ──────────────────────

const noise3D_lo = createNoise3D(() => 0.41728);  // large-scale shape deformation
const noise3D_md = createNoise3D(() => 0.83561);  // mid-frequency cracks / facets
const noise3D_hi = createNoise3D(() => 0.26934);  // fine surface roughness

// ─── displaceMesh ─────────────────────────────────────────────────────────────

/**
 * Displaces vertices of an IcosahedronGeometry in-place along their normals,
 * using three octaves of Simplex noise weighted by `intensity`.
 *
 *   Octave 1: frequency=0.8  amplitude=1.0  — large lumpy shape
 *   Octave 2: frequency=2.2  amplitude=0.35 — medium cracks / ridges
 *   Octave 3: frequency=6.5  amplitude=0.10 — fine surface pitting
 *
 * @param geo       IcosahedronBufferGeometry (or any sphere-like geometry)
 * @param seed      Deterministic random offset; varies each boulder instance
 * @param intensity Maximum displacement magnitude in world units
 */
export function displaceMesh(
  geo: THREE.BufferGeometry,
  seed: number,
  intensity: number,
): void {
  // We need normals to displace ALONG the surface normal (outward)
  geo.computeVertexNormals();

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal  as THREE.BufferAttribute;

  const sx = Math.sin(seed * 127.1) * 31.4;
  const sy = Math.cos(seed * 311.7) * 18.7;
  const sz = Math.sin(seed * 74.3)  * 27.2;

  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);

    const vx = pos.getX(i) + sx;
    const vy = pos.getY(i) + sy;
    const vz = pos.getZ(i) + sz;

    // Three octaves — different frequencies, progressively smaller amplitude
    const n1 = noise3D_lo(vx * 0.80, vy * 0.80, vz * 0.80);           // shape
    const n2 = noise3D_md(vx * 2.20, vy * 2.20, vz * 2.20) * 0.35;    // facets
    const n3 = noise3D_hi(vx * 6.50, vy * 6.50, vz * 6.50) * 0.10;    // pits

    const disp = (n1 + n2 + n3) * intensity;

    pos.setXYZ(i, pos.getX(i) + nx * disp, pos.getY(i) + ny * disp, pos.getZ(i) + nz * disp);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals(); // re-compute after displacement
}

// ─── buildNormalMap ───────────────────────────────────────────────────────────

/** Cached shared normal-map texture (built once). */
let _normalMapCache: THREE.Texture | null = null;

/**
 * Returns a 256×256 procedural normal-map texture rendered via the Canvas API.
 * The pattern is a cellular Voronoi-like crack network that resembles fractured
 * basalt / dry-lake surface structure commonly seen on lunar boulders.
 *
 * The result is cached: only one canvas draw happens per page load.
 */
export function buildNormalMap(): THREE.Texture {
  if (_normalMapCache) return _normalMapCache;

  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Fill with neutral normal (128,128,255) = pointing straight up
  ctx.fillStyle = `rgb(128,128,255)`;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Deterministic pseudo-Voronoi seed points — these become crack junctions
  const SEEDS = 22;
  const pts: [number, number][] = [];
  for (let i = 0; i < SEEDS; i++) {
    const t = i / SEEDS;
    pts.push([
      (Math.sin(i * 137.508 * Math.PI / 180) * 0.5 + 0.5) * SIZE,
      (Math.cos(i * 137.508 * Math.PI / 180) * 0.5 + 0.5) * SIZE,
    ]);
  }

  // Draw thin crack-like lines between nearby Voronoi neighbours
  // Cracks are a slightly shifted blue-purple (surface normal tilted sideways)
  ctx.strokeStyle = 'rgb(100,100,240)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < SEEDS; i++) {
    for (let j = i + 1; j < SEEDS; j++) {
      const dx = pts[j][0] - pts[i][0];
      const dy = pts[j][1] - pts[i][1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SIZE * 0.38) {
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      }
    }
  }

  // Soft grain / bump noise overlay — drawn as many tiny circles with slight
  // tint variation to simulate micro-pitting (regolith impact gardening).
  const RNG_GRAIN = (n: number) => (Math.sin(n * 374.13 + 1.1) * 0.5 + 0.5);
  for (let k = 0; k < 600; k++) {
    const gx = RNG_GRAIN(k * 1.3) * SIZE;
    const gy = RNG_GRAIN(k * 2.7) * SIZE;
    const gr = 1.5 + RNG_GRAIN(k * 5.1) * 4.0;
    const bright = Math.floor(110 + RNG_GRAIN(k * 3.9) * 30);
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${bright},${bright},248)`;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);  // tile across rock face
  tex.needsUpdate = true;

  _normalMapCache = tex;
  return tex;
}

// ─── makeLunarRockMaterial ────────────────────────────────────────────────────

/**
 * Creates a MeshStandardMaterial for a photorealistic lunar basalt boulder.
 *
 * Material properties:
 *   roughness 0.94 — extremely matte, dusty regolith surface
 *   metalness 0.04 — near-zero; rocks are dielectric at this scale
 *   color     warm dark-grey ochre variants to match Apollo sample photos
 *   map       (optional) lunar albedo texture tiled at a per-rock repeat
 *   normalMap procedural crack/pitting map from buildNormalMap()
 *   normalScale 0.55 — subtle; physical rock cracks are fine, not deep
 *
 * @param lunarTex  THREE.Texture from lunar-displacement.jpg (the shared albedo)
 * @param baseColor hex string for the rock albedo tint
 * @param seed      per-instance variation seed (shifts texture repeat slightly)
 */
export function makeLunarRockMaterial(
  lunarTex: THREE.Texture | null,
  baseColor: string,
  seed: number,
): THREE.MeshStandardMaterial {
  const normalMap = buildNormalMap();

  // Per-instance texture repeat offset so every boulder looks unique
  const uOff = (Math.sin(seed * 4.7) * 0.5 + 0.5) * 0.5;
  const vOff = (Math.cos(seed * 3.1) * 0.5 + 0.5) * 0.5;
  const repeatScale = 1.5 + (Math.sin(seed * 2.3) * 0.5 + 0.5) * 1.5;

  let rockTex: THREE.Texture | null = null;
  if (lunarTex) {
    // Clone the shared texture so each rock can have its own repeat/offset
    rockTex = lunarTex.clone();
    rockTex.needsUpdate = true;
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
    rockTex.repeat.set(repeatScale, repeatScale);
    rockTex.offset.set(uOff, vOff);
  }

  const mat = new THREE.MeshStandardMaterial({
    color:        new THREE.Color(baseColor),
    roughness:    0.94,
    metalness:    0.04,
    normalMap,
    normalScale:  new THREE.Vector2(0.55, 0.55),
  });

  if (rockTex) mat.map = rockTex;

  return mat;
}
