import { Fuel } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function FuelPanel({ analysis }: Props) {
  const f = analysis.fuel;
  const noConsumption = f.perLap <= 0;

  return (
    <Card title="Fuel" icon={<Fuel className="w-4 h-4" />}>
      <MetricRow label="Start" value={f.start.toFixed(1)} unit="L" />
      <MetricRow label="End" value={f.end.toFixed(1)} unit="L" />
      {noConsumption ? (
        <MetricRow label="Consumption" value="N/A" />
      ) : (
        <>
          <MetricRow label="Per Lap" value={f.perLap.toFixed(2)} unit="L" />
          <MetricRow label="Range" value={`~${Math.floor(f.range)}`} unit="laps" />
        </>
      )}
      {noConsumption && (
        <p className="text-[var(--color-text-muted)] text-[11px] mt-3">
          Fuel consumption may be disabled in session settings.
        </p>
      )}
    </Card>
  );
}
