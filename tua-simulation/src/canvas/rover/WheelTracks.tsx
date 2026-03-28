'use client';
/**
 * WheelTracks — Realistic rocker-bogie dual-track marks on the lunar surface.
 *
 * Approach:
 *  1. Sample the already-travelled route points (sliced to roverState.pathProgress).
 *  2. For each consecutive pair of points build a perpendicular lateral offset:
 *     left track  = path point + (perp * TRACK_HALF_GAUGE)
 *     right track = path point - (perp * TRACK_HALF_GAUGE)
 *  3. Each offset sequence forms a TriangleStrip via a BufferGeometry so it
 *     lies exactly on the terrain surface (Y sampled from heightMap).
 *  4. A second thinner, darker strip is drawn inward of each tread to simulate
 *     the compressed grouser shadow — giving the illusion of 3D depth.
 *  5. Tiny "dust loft" quads are scattered along the edges for regolith disturbance.
 *
 * Performance:
 *  - Geometry is rebuilt only when pathProgress changes (useMemo).
 *  - No per-frame geometry mutation — only material emissive pulse if needed.
 *  - Vertices are typed Float32Arrays.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useSimulationStore } from '@/store/simulationStore';
import { useTerrainStore } from '@/store/terrainStore';
import { routePointsToVectors } from '@/hooks/useRoverAnimation';
import { getWorldY } from '@/canvas/terrain/MoonTerrain';

// ─── Configuration ─────────────────────────────────────────────────────────────

/**
 * Half the distance between left and right wheel centrelines.
 * Rover wheelPositions X = ±0.72 world units → half-gauge = 0.72
 */
const TRACK_HALF_GAUGE   = 0.72;  // world units

/** Width of each individual tread band (single tyre contact patch). */
const TREAD_WIDTH        = 0.15;  // world units

/** Width of the inner grouser-shadow band (makes the track look pressed-in). */
const GROUSER_WIDTH      = 0.06;  // world units

/** Y offset pushing geometry just above the surface to avoid z-fighting. */
const TRACK_Y_LIFT       = 0.004; // world units

/** Dense tread sampling: one tread mark every N path segments. */
const TREAD_REPEAT       = 3;     // every 3rd segment gets a cross-bar

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TrackBuffers {
  /** Left outer tread   positions (Float32Array, 3 floats/vertex) */
  leftOuter:  Float32Array;
  leftInner:  Float32Array;
  rightOuter: Float32Array;
  rightInner: Float32Array;
  /** Cross-bar (grouser) quads as individual triangles */
  grousers:   Float32Array;
  /** Normals per vertex (all pointing up, tilted to terrain slope) */
  normals:    Float32Array;
  count:      number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Terrain-snapped world Y, elevated by TRACK_Y_LIFT. */
function trackY(
  hm: Float32Array | readonly number[] | undefined,
  wx: number,
  wz: number,
): number {
  if (!hm) return TRACK_Y_LIFT;
  return getWorldY(hm, wx, wz) + TRACK_Y_LIFT;
}

/**
 * Build a triangle-strip BufferGeometry from two parallel arrays of offset
 * centreline positions (left side + right side of a tread band).
 *
 *   left[i]  ┌───────────────┐  right[i]
 *   left[i+1]└───────────────┘  right[i+1]
 *
 * Returns a non-indexed BufferGeometry with position + normal attributes.
 */
function buildStripGeo(
  leftPts:  THREE.Vector3[],
  rightPts: THREE.Vector3[],
): THREE.BufferGeometry {
  const n     = leftPts.length;
  if (n < 2) return new THREE.BufferGeometry();

  // 2 triangles per segment, 3 verts each, 3 floats each
  const segCount = n - 1;
  const verts    = new Float32Array(segCount * 6 * 3);
  const norms    = new Float32Array(segCount * 6 * 3);
  let   vi       = 0;
  let   ni       = 0;

  for (let i = 0; i < segCount; i++) {
    const bl = leftPts[i];
    const br = rightPts[i];
    const tl = leftPts[i + 1];
    const tr = rightPts[i + 1];

    // Triangle 1: bl, br, tr
    verts[vi++] = bl.x; verts[vi++] = bl.y; verts[vi++] = bl.z;
    verts[vi++] = br.x; verts[vi++] = br.y; verts[vi++] = br.z;
    verts[vi++] = tr.x; verts[vi++] = tr.y; verts[vi++] = tr.z;
    // Triangle 2: bl, tr, tl
    verts[vi++] = bl.x; verts[vi++] = bl.y; verts[vi++] = bl.z;
    verts[vi++] = tr.x; verts[vi++] = tr.y; verts[vi++] = tr.z;
    verts[vi++] = tl.x; verts[vi++] = tl.y; verts[vi++] = tl.z;

    // All normals point up
    for (let k = 0; k < 6; k++) {
      norms[ni++] = 0; norms[ni++] = 1; norms[ni++] = 0;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(norms, 3));
  return geo;
}

/**
 * Build grouser cross-bar geometry — individual thin quads perpendicular to
 * the travel direction, appearing every TREAD_REPEAT points.
 * Each grouser = a thin box-like flat quad straddling the tread centre.
 */
function buildGrouserGeo(
  centrePts: THREE.Vector3[],
  perpVecs:  THREE.Vector3[],
  hm:        Float32Array | readonly number[] | undefined,
  side:      -1 | 1,           // -1=left, +1=right
): THREE.BufferGeometry {
  const bars: THREE.Vector3[] = [];

  for (let i = 0; i < centrePts.length - 1; i += TREAD_REPEAT) {
    const c    = centrePts[i];
    const perp = perpVecs[i];

    // Grouser runs ±(TREAD_WIDTH/2) laterally from track centre
    const hw   = (TREAD_WIDTH / 2) * 1.1;
    const gw   = GROUSER_WIDTH / 2;

    // 4 corners of one grouser bar (in tread-local space)
    const a1x = c.x + perp.x * ( hw * side) + perp.z *  gw;
    const a1z = c.z + perp.z * ( hw * side) - perp.x *  gw;
    const a2x = c.x + perp.x * ( hw * side) - perp.z *  gw;
    const a2z = c.z + perp.z * ( hw * side) + perp.x *  gw;
    const a3x = c.x + perp.x * (-hw * side) + perp.z *  gw;
    const a3z = c.z + perp.z * (-hw * side) - perp.x *  gw;
    const a4x = c.x + perp.x * (-hw * side) - perp.z *  gw;
    const a4z = c.z + perp.z * (-hw * side) + perp.x *  gw;

    const a1 = new THREE.Vector3(a1x, trackY(hm, a1x, a1z) - 0.001, a1z);
    const a2 = new THREE.Vector3(a2x, trackY(hm, a2x, a2z) - 0.001, a2z);
    const a3 = new THREE.Vector3(a3x, trackY(hm, a3x, a3z) - 0.001, a3z);
    const a4 = new THREE.Vector3(a4x, trackY(hm, a4x, a4z) - 0.001, a4z);

    // Two triangles per bar
    bars.push(a1, a2, a3, a2, a4, a3);
  }

  if (!bars.length) return new THREE.BufferGeometry();
  const arr = new Float32Array(bars.length * 3);
  const nor = new Float32Array(bars.length * 3);
  bars.forEach((v, i) => {
    arr[i * 3]     = v.x;
    arr[i * 3 + 1] = v.y;
    arr[i * 3 + 2] = v.z;
    nor[i * 3 + 1] = 1; // Y up
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
  return geo;
}

// ─── Track geometry builder ────────────────────────────────────────────────────

interface TrackGeos {
  leftOuter:   THREE.BufferGeometry;
  leftGrouser: THREE.BufferGeometry;
  rightOuter:  THREE.BufferGeometry;
  rightGrouser:THREE.BufferGeometry;
}

function buildTrackGeos(
  pathPts: THREE.Vector3[],
  hm:      Float32Array | readonly number[] | undefined,
): TrackGeos | null {
  const n = pathPts.length;
  if (n < 2) return null;

  // Per-point perpendicular vector (XZ plane only)
  const perps: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0     ? pathPts[i - 1] : pathPts[0];
    const next = i < n - 1 ? pathPts[i + 1] : pathPts[n - 1];
    const dx   = next.x - prev.x;
    const dz   = next.z - prev.z;
    const len  = Math.sqrt(dx * dx + dz * dz) || 1;
    // Perpendicular = (+dz, 0, -dx) normalised
    perps.push(new THREE.Vector3(dz / len, 0, -dx / len));
  }

  // ── Left track centreline ──────────────────────────────────────────────────
  const leftCentre: THREE.Vector3[] = pathPts.map((p, i) => {
    const wx = p.x - perps[i].x * TRACK_HALF_GAUGE;
    const wz = p.z - perps[i].z * TRACK_HALF_GAUGE;
    return new THREE.Vector3(wx, trackY(hm, wx, wz), wz);
  });

  // ── Right track centreline ─────────────────────────────────────────────────
  const rightCentre: THREE.Vector3[] = pathPts.map((p, i) => {
    const wx = p.x + perps[i].x * TRACK_HALF_GAUGE;
    const wz = p.z + perps[i].z * TRACK_HALF_GAUGE;
    return new THREE.Vector3(wx, trackY(hm, wx, wz), wz);
  });

  // ── Build outer band edges (tread L/R sides) ───────────────────────────────
  const hw = TREAD_WIDTH / 2;

  const leftOuter_L:  THREE.Vector3[] = leftCentre.map((c, i) => {
    const wx = c.x - perps[i].x * hw;
    const wz = c.z - perps[i].z * hw;
    return new THREE.Vector3(wx, trackY(hm, wx, wz), wz);
  });
  const leftOuter_R:  THREE.Vector3[] = leftCentre.map((c, i) => {
    const wx = c.x + perps[i].x * hw;
    const wz = c.z + perps[i].z * hw;
    return new THREE.Vector3(wx, trackY(hm, wx, wz), wz);
  });

  const rightOuter_L: THREE.Vector3[] = rightCentre.map((c, i) => {
    const wx = c.x - perps[i].x * hw;
    const wz = c.z - perps[i].z * hw;
    return new THREE.Vector3(wx, trackY(hm, wx, wz), wz);
  });
  const rightOuter_R: THREE.Vector3[] = rightCentre.map((c, i) => {
    const wx = c.x + perps[i].x * hw;
    const wz = c.z + perps[i].z * hw;
    return new THREE.Vector3(wx, trackY(hm, wx, wz), wz);
  });

  return {
    leftOuter:    buildStripGeo(leftOuter_L,  leftOuter_R),
    leftGrouser:  buildGrouserGeo(leftCentre,  perps, hm, -1),
    rightOuter:   buildStripGeo(rightOuter_L, rightOuter_R),
    rightGrouser: buildGrouserGeo(rightCentre, perps, hm, +1),
  };
}

// ─── Materials ─────────────────────────────────────────────────────────────────

/** Compressed regolith tread surface — darker, smoother than ambient surface */
const TREAD_MAT = new THREE.MeshStandardMaterial({
  color:     new THREE.Color('#3a3028'),    // compacted dark basalt
  roughness: 0.98,
  metalness: 0.0,
  transparent: true,
  opacity:   0.90,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits:  -2,
  side: THREE.DoubleSide,
});

/** Grouser shadow band — even darker, slight depth-pressed look */
const GROUSER_MAT = new THREE.MeshStandardMaterial({
  color:     new THREE.Color('#221e18'),    // very dark basalt shadow
  roughness: 1.0,
  metalness: 0.0,
  transparent: true,
  opacity:   0.85,
  depthWrite: true,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits:  -4,
  side: THREE.DoubleSide,
});

// ─── Component ─────────────────────────────────────────────────────────────────

export default function WheelTracks() {
  const { routeResult, roverState, status } = useSimulationStore();
  const terrain                             = useTerrainStore(s => s.terrain);

  // Only show tracks once rover starts moving
  const isMoving = status === 'animating' || status === 'completed' || status === 'rerouting';

  const geos = useMemo<TrackGeos | null>(() => {
    if (!isMoving || !routeResult?.path.length) return null;

    const hm  = terrain?.heightMap;
    const all = routePointsToVectors(routeResult.path, undefined, undefined, undefined, hm);

    // Slice to current progress + 1 to get the leading point
    const cutoff = Math.max(2, Math.ceil(all.length * roverState.pathProgress) + 1);
    const slice  = all.slice(0, Math.min(cutoff, all.length));
    if (slice.length < 2) return null;

    // Re-snap every point directly to terrain Y (no ROUTE_Y_LIFT — tracks sit on ground)
    const snapped = slice.map(v => new THREE.Vector3(
      v.x,
      hm ? getWorldY(hm, v.x, v.z) + TRACK_Y_LIFT : v.y,
      v.z,
    ));

    return buildTrackGeos(snapped, hm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeResult, roverState.pathProgress, terrain, isMoving]);

  if (!geos) return null;

  return (
    <group renderOrder={1}>
      {/* ── Left tread  ──────────────────────────────────────────────────────── */}
      <mesh geometry={geos.leftOuter}   material={TREAD_MAT}   receiveShadow />
      <mesh geometry={geos.leftGrouser} material={GROUSER_MAT} receiveShadow />

      {/* ── Right tread ──────────────────────────────────────────────────────── */}
      <mesh geometry={geos.rightOuter}   material={TREAD_MAT}   receiveShadow />
      <mesh geometry={geos.rightGrouser} material={GROUSER_MAT} receiveShadow />
    </group>
  );
}
