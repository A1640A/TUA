'use client';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

export default function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        intensity={0.6}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <Vignette
        offset={0.4}
        darkness={0.65}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
