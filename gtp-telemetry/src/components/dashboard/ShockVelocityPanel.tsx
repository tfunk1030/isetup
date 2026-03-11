import { Activity } from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function ShockVelocityPanel({ analysis }: Props) {
  const stats = analysis.shockVelStats;

  return (
    <Card title="Shock Velocity Analysis" icon={<Activity className="w-4 h-4" />}>
      <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {Object.entries(stats).map(([corner, d]) => (
          <div key={corner} className="p-4 bg-[var(--color-bg-subtle)] rounded-xl">
            <h4
              className="mb-3 text-sm font-semibold"
              style={{ color: COLORS[corner as keyof typeof COLORS] || COLORS.text }}
            >
              {corner}
            </h4>
            <MetricRow label="p95" value={d.p95.toFixed(0)} unit="mm/s" />
            <MetricRow label="p99" value={d.p99.toFixed(0)} unit="mm/s" />
            <MetricRow
              label="Peak"
              value={d.peak.toFixed(0)}
              unit="mm/s"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
