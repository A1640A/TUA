/** Maps a 0-1 cost value to a heatmap color (blue → green → yellow → red) */
export function costToHeatmapColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.25) {
    const f = clamped / 0.25;
    return `rgb(0, ${Math.round(f * 200)}, 255)`;
  } else if (clamped < 0.5) {
    const f = (clamped - 0.25) / 0.25;
    return `rgb(0, 200, ${Math.round((1 - f) * 255)})`;
  } else if (clamped < 0.75) {
    const f = (clamped - 0.5) / 0.25;
    return `rgb(${Math.round(f * 255)}, 200, 0)`;
  } else {
    const f = (clamped - 0.75) / 0.25;
    return `rgb(255, ${Math.round((1 - f) * 200)}, 0)`;
  }
}

/** Three.js color from heatmap */
export function costToThreeColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.5) {
    return [0, clamped * 2, 1 - clamped * 2];
  } else {
    return [(clamped - 0.5) * 2, 1 - (clamped - 0.5) * 2, 0];
  }
}
