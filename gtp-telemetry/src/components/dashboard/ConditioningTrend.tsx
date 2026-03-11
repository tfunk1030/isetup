import { Thermometer } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function ConditioningTrend({ analysis }: Props) {
  if (!analysis.conditioning) return null;

  return (
    <Card title="Tyre Conditioning" icon={<Thermometer className="w-4 h-4" />}>
      {Object.entries(analysis.conditioning).map(([corner, d]) => (
        <MetricRow
          key={corner}
          label={corner}
          value={`${d.rate > 0 ? '+' : ''}${d.rate.toFixed(1)}\u00B0C/lap`}
          unit={d.lapsTo85 < 50 ? `${d.lapsTo85} to 85\u00B0C` : '\u2014'}
        />
      ))}
    </Card>
  );
}
