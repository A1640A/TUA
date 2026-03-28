'use client';
interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}

export default function Slider({
  label, value, min = 0, max = 10, step = 0.1, onChange, unit = '',
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs text-white/60 font-medium">{label}</label>
        <span className="text-xs font-mono text-sky-400 tabular-nums">
          {value.toFixed(1)}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-sky-400"
        style={{ background: `linear-gradient(to right, #38bdf8 ${pct}%, rgba(255,255,255,0.1) 0%)` }}
      />
    </div>
  );
}
