'use client';
/**
 * PostProcessing v3 — cinematic space aesthetic.
 *
 * Fixes applied:
 *
 *  1. useThree() null guard:
 *     During HMR the WebGL renderer can briefly be null between tear-down
 *     and re-mount.  EffectComposer.setRenderer() would throw
 *     "Cannot read properties of null (reading 'alpha')" in that window.
 *     Guard added: if (!gl) return null.
 *
 *  2. Stable Vector2 reference:
 *     Moved ChromaticAberration offset out of JSX to module scope so React
 *     doesn't see a new object identity on every render (avoids unnecessary
 *     re-renders and posprocessing prop diffing overhead).
 *
 *  3. Error boundary removed from Scene.tsx:
 *     The old PostProcessingErrorBoundary class component inside R3F's Canvas
 *     caused "Expected static flag was missing" (React 19 + custom reconciler
 *     incompatibility) and "Maximum update depth exceeded" (componentDidCatch
 *     → setState loop).  Both fixed by removing the class component entirely.
 *     This component is now self-guarded.
 */
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';

// ── Stable module-level constants (do NOT create inline in JSX) ──────────────
// Creating `new Vector2(...)` inside JSX gives a new reference every render,
// which confuses postprocessing's memoisation and causes needless recomposites.
const CA_OFFSET = new Vector2(0.0004, 0.0004);

export default function PostProcessing() {
  // Guard: don't mount EffectComposer if the WebGL renderer is not ready.
  // This handles the HMR window where the renderer is momentarily null.
  const { gl } = useThree();
  if (!gl) return null;

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
        offset={CA_OFFSET}
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
