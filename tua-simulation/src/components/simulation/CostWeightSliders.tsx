'use client';
import Slider from '@/components/ui/Slider';
import { useSimulationStore } from '@/store/simulationStore';

export default function CostWeightSliders() {
  const { costWeights, setCostWeights } = useSimulationStore();
  return (
    <div className="space-y-4">
      <Slider
        label="Eğim Ağırlığı"
        description="Eğimin karesel cezası (slope²). Yüksek değer, dik yamaçlardan kaçınan düz yollar üretir. Rover devrilme riski için kritiktir."
        value={costWeights.slopeWeight}
        min={0} max={10} step={0.1}
        onChange={v => setCostWeights({ slopeWeight: v })}
      />
      <Slider
        label="Krater Risk Ağırlığı"
        description="Krater bölgelerinden geçiş cezası. Yüksek değer, kraterlerden geniş yay çizen güvenli bir güzergâh oluşturur; düşük değer mesafeyi kısaltır."
        value={costWeights.craterRiskWeight}
        min={0} max={15} step={0.1}
        onChange={v => setCostWeights({ craterRiskWeight: v })}
      />
      <Slider
        label="Yükseklik Ağırlığı"
        description="İki hücre arasındaki mutlak yükseklik farkı cezası. Yüksek değer, enerji tüketimini azaltmak için düz arazileri tercih eden rotalar üretir."
        value={costWeights.elevationWeight}
        min={0} max={5} step={0.1}
        onChange={v => setCostWeights({ elevationWeight: v })}
      />
    </div>
  );
}
