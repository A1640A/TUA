'use client';
interface SliderProps {
  label:        string;
  description?: string;
  value:        number;
  min?:         number;
  max?:         number;
  step?:        number;
  onChange:     (v: number) => void;
  unit?:        string;
}

export default function Slider({
  label, description, value, min = 0, max = 10, step = 0.1, onChange, unit = '',
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      {/* Label + value row */}
      <div className="flex justify-between items-center">
        <label className="text-[13px] text-white/80 font-semibold">{label}</label>
        <span className="text-[13px] font-mono font-bold text-sky-300 tabular-nums">
          {value.toFixed(1)}{unit}
        </span>
      </div>

      {/* Description — readable grey, not tiny italic */}
      {description && (
        <p className="text-[12px] leading-[1.55] text-white/50">
          {description}
        </p>
      )}

      {/* Range track */}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-sky-400"
        style={{ background: `linear-gradient(to right, #38bdf8 ${pct}%, rgba(255,255,255,0.12) 0%)` }}
      />
    </div>
  );
}
