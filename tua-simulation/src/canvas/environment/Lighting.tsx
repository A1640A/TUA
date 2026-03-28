'use client';
/**
 * Lighting — Physically-based lunar surface illumination.
 *
 * Solar irradiance model:
 *  The Moon receives ≈ 1361 W/m² unattenuated solar flux.
 *  At the surface, direct sunlight is effectively a parallel beam
 *  (parallel light, not point source) arriving at the local elevation angle.
 *
 *  We simulate a sun at ~28° elevation above the horizon (azimuth NW).
 *  This angle creates long crater shadows that reveal the terrain relief,
 *  while still illuminating enough of the interior to see detail.
 *
 *  Key parameters:
 *   • Sun intensity 4.2  — main key light (DirectionalLight)
 *   • Ambient      0.06  — residual backlighting from multiple-scattering
 *                          highland regolith (Hapke 1981 opposition surge)
 *   • Earthshine   0.18  — Earth albedo ≈ 0.30, solid angle ≈ 0.8°,
 *                          gives ~0.002 solar constants of reflected light;
 *                          amplified here for aesthetic readability
 *
 *  Shadow frustum exactly covers TERRAIN_SCALE = 55 units with 15 % margin.
 *  Shadow map 4096² + PCFSoftShadowMap (set in Scene.tsx) gives anti-aliased
 *  penumbra on crater rims.
 */

const TERRAIN_HALF = 34; // 55/2 + 10% padding

export default function Lighting() {
  return (
    <>
      {/* ── Primary: Solar disc simulation ────────────────────────────────── */}
      {/*   Position encodes sun direction (normalised after Three.js):
            azimuth ≈ 320° (NW), elevation ≈ 28°
            pos = R·[sin(az)·cos(el), sin(el), cos(az)·cos(el)]  (any R works)  */}
      <directionalLight
        position={[48, 38, -28]}          /* NW sun, 28° elevation */
        intensity={4.2}
        color="#fff8e0"                   /* 5800 K blackbody, slightly warm */
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-camera-left={-TERRAIN_HALF}
        shadow-camera-right={TERRAIN_HALF}
        shadow-camera-top={TERRAIN_HALF}
        shadow-camera-bottom={-TERRAIN_HALF}
        shadow-bias={-0.0004}            /* suppress shadow acne on curved surf */
        shadow-normalBias={0.06}         /* smooth self-shadowing on rim faces */
      />

      {/* ── Ambient: regolith multiple-scatter + sky-equivalent ───────────── */}
      {/*   Real Moon: ambient ≈ 0  (no atmosphere).
            We add a very faint cool ambient to prevent pitch-black shadows
            and to suggest the faint earthshine + galactic background.       */}
      <ambientLight intensity={0.06} color="#2255bb" />

      {/* ── Earthshine fill ───────────────────────────────────────────────── */}
      {/*   Direction: opposite the sun (Earth is roughly in the anti-solar
            direction during full-moon).  Blue-white (Earth dayside albedo).  */}
      <directionalLight
        position={[-38, 22, 28]}
        intensity={0.18}
        color="#5588ee"
      />

      {/* ── Solar back-scatter / rim light ────────────────────────────────── */}
      {/*   Simulates the solar corona + very slight zodiacal scattering that
            provides a soft rim kick separating the rover from the terrain.   */}
      <directionalLight
        position={[0, 10, -60]}
        intensity={0.10}
        color="#ffe0b0"
      />
    </>
  );
}
