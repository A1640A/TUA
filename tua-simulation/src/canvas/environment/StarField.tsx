'use client';
import { Stars } from '@react-three/drei';
export default function StarField() {
  return (
    <Stars
      radius={300}
      depth={60}
      count={8000}
      factor={4}
      saturation={0.1}
      fade
      speed={0.3}
    />
  );
}
