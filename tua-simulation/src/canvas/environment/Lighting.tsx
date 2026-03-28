'use client';
export default function Lighting() {
  return (
    <>
      <ambientLight intensity={0.08} color="#4488bb" />
      <directionalLight
        position={[40, 60, 30]}
        intensity={2.2}
        color="#fff8e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={200}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      {/* Subtle fill from opposite side  simulates lunar earthshine */}
      <directionalLight position={[-30, 20, -20]} intensity={0.15} color="#2244aa" />
    </>
  );
}
