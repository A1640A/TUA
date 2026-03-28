'use client';
/**
 * Lighting — Lunar surface illumination rig.
 *
 * Design goals:
 *  1. HIGH-CONTRAST sun: a single DirectionalLight at a low sun angle (≈30°
 *     elevation, coming from W-NW) casts long, hard shadows that emphasise
 *     crater rims and displacement map relief.
 *  2. VERY LOW ambient: models the near-vacuum of the Moon (no Rayleigh
 *     scattering, no atmospheric fill).  Only a faint blue-grey earthshine
 *     fill is added from the opposite direction.
 *  3. LARGE shadow frustum: covers the entire TERRAIN_SCALE area (50×50 units)
 *     with generous padding.  PCFSoftShadowMap is set in Scene.tsx Canvas gl.
 */
export default function Lighting() {
  return (
    <>
      {/* ── Sun (primary DirectionalLight) ───────────────────────────── */}
      {/* Low elevation angle from the west; this drapes long shadows across
          crater floors and makes the displacement map pop dramatically. */}
      <directionalLight
        position={[55, 35, -25]}
        intensity={3.2}
        color="#fff5d6"   /* warm, slightly yellowed sunlight */
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.0005}              /* reduce shadow acne on curved surf */
        shadow-normalBias={0.04}
      />

      {/* ── Ambient — near-vacuum space: extremely dim ─────────────────── */}
      {/* Even the Moon has a tiny bit of scattered light from the regolith
          backscattering; we model that with a cool, very faint ambient. */}
      <ambientLight intensity={0.045} color="#3366aa" />

      {/* ── Earthshine fill (secondary DirectionalLight) ──────────────── */}
      {/* Blue-white light opposite the sun, simulating reflected earthlight.
          No shadows — it's a fill, not a key light. */}
      <directionalLight
        position={[-40, 18, 30]}
        intensity={0.12}
        color="#4488dd"
      />

      {/* ── Rim light from behind ──────────────────────────────────────── */}
      {/* Adds depth-separation between the rover and the terrain edge. */}
      <directionalLight
        position={[0, 8, -55]}
        intensity={0.08}
        color="#aabbcc"
      />
    </>
  );
}
