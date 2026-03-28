'use client';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';

/**
 * PostProcessing — cinematic space aesthetic.
 *
 * Changes:
 *  - Noise effect REMOVED  → was causing the "old TV static" appearance
 *  - Bloom kept but softened (luminanceThreshold raised, smoothing wider)
 *  - ChromaticAberration kept very subtle for lens realism
 *  - Vignette lightened so corners are not overly crushed
 */
export default function PostProcessing() {
  return (
    <EffectComposer>
      {/* Soft bloom — emissive path tube, rover lights, waypoint beacons */}
      <Bloom
        intensity={0.75}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      {/* Barely-visible lens distortion at extreme edges only */}
      <ChromaticAberration
        offset={new Vector2(0.0004, 0.0004)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      {/* Gentle vignette — focuses eye on centre without crushing blacks */}
      <Vignette
        offset={0.42}
        darkness={0.5}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
