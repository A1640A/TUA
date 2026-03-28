'use client';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';

/**
 * Post-processing pass stack for a cinematic space-monitor aesthetic.
 *
 * - **Bloom**: Makes all emissive surfaces (path tube, crater rings, sensor heads)
 *   glow with physically-based bloom.
 * - **ChromaticAberration**: Subtle lens-aberration at screen edges — the single
 *   biggest signal that this is a "real instrument", not a game.
 * - **Noise**: Minimal film grain (opacity 0.018) replicating the visual noise of
 *   a real space-station telemetry feed.
 * - **Vignette**: Darkens screen corners to focus the viewer on the centre.
 */
export default function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={0.9}
        luminanceThreshold={0.45}
        luminanceSmoothing={0.8}
        mipmapBlur
      />
      <ChromaticAberration
        offset={new Vector2(0.0008, 0.0008)}
        blendFunction={BlendFunction.NORMAL}
        radialModulation={false}
        modulationOffset={0}
      />
      <Noise
        opacity={0.018}
        blendFunction={BlendFunction.ADD}
      />
      <Vignette
        offset={0.38}
        darkness={0.7}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
