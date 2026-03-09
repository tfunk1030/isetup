import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function DriverAidsPanel({ analysis }: Props) {
  return (
    <Card title="Driver Aids" icon={'\u{1F39B}\uFE0F'}>
      {Object.entries(analysis.aids).map(([name, d]) => (
        <div key={name} className="mb-3">
          <div className="flex justify-between mb-1">
            <span className="text-[var(--color-text-dim)] text-[13px]">{name}</span>
            <StatusBadge status={d.constant ? 'OK' : 'HIGH'} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-muted)] text-[11px] w-10 font-mono">
              {d.min.toFixed(1)}
            </span>
            <div className="flex-1 h-1.5 bg-[var(--color-bg)] rounded-sm relative">
              <div
                className="absolute h-full rounded-sm"
                style={{
                  left: '0%',
                  right: `${100 - ((d.avg - d.min) / (d.max - d.min + 0.01)) * 100}%`,
                  background: d.constant ? COLORS.green : COLORS.accent,
                }}
              />
            </div>
            <span className="text-[var(--color-text-muted)] text-[11px] w-10 text-right font-mono">
              {d.max.toFixed(1)}
            </span>
          </div>
        </div>
      ))}
      <p className="text-[var(--color-text-muted)] text-[11px] mt-4">
        Changing aids = warning. If RARB changes correlate with speed bands (low blades in slow corners, high at speed), that's intentional live management.
      </p>
    </Card>
  );
}
