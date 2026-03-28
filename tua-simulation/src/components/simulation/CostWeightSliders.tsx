'use client';
import Slider from '@/components/ui/Slider';
import { useSimulationStore } from '@/store/simulationStore';

export default function CostWeightSliders() {
  const { costWeights, setCostWeights } = useSimulationStore();
  return (
    <div className="space-y-4">
      <Slider
        label="Eğim Ağırlığı"
        value={costWeights.slopeWeight}
        min={0} max={10} step={0.1}
        onChange={v => setCostWeights({ slopeWeight: v })}
      />
      <Slider
        label="Krater Risk Ağırlığı"
        value={costWeights.craterRiskWeight}
        min={0} max={15} step={0.1}
        onChange={v => setCostWeights({ craterRiskWeight: v })}
      />
      <Slider
        label="Yükseklik Ağırlığı"
        value={costWeights.elevationWeight}
        min={0} max={5} step={0.1}
        onChange={v => setCostWeights({ elevationWeight: v })}
      />
    </div>
  );
}
