import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { COLORS, SHOCK_VELOCITY } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function ShockVelocityPanel({ analysis }: Props) {
  const stats = analysis.shockVelStats;

  return (
    <Card title="Shock Velocity Analysis" icon={'\u{1F4C8}'}>
      <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {Object.entries(stats).map(([corner, d]) => (
          <div key={corner} className="p-3 bg-[var(--color-bg)] rounded-lg">
            <h4
              className="mb-2 text-sm font-semibold"
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
              status={d.peak > SHOCK_VELOCITY.EXTREME ? 'HOT' : d.peak > SHOCK_VELOCITY.HIGH ? 'HIGH' : 'OK'}
            />
          </div>
        ))}
      </div>
      <p className="text-[var(--color-text-muted)] text-[11px] mt-3">
        Penske: &lt;75 mm/s = low-speed damper regime. &gt;700 mm/s = extreme events — consider digressive HS comp slope.
      </p>
    </Card>
  );
}
