import { SlidersHorizontal } from 'lucide-react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import { COLORS } from '../../lib/constants';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function DriverAidsPanel({ analysis }: Props) {
  return (
    <Card title="Driver Aids" icon={<SlidersHorizontal className="w-4 h-4" />}>
      {Object.entries(analysis.aids).map(([name, d]) => (
        <div key={name} className="mb-4 last:mb-0">
          <div className="flex justify-between mb-1.5">
            <span className="text-[var(--color-text-dim)] text-[13px]">{name}</span>
            <StatusBadge status={d.constant ? 'OK' : 'HIGH'} />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--color-text-muted)] text-[11px] w-10 font-mono tabular-nums">
              {d.min.toFixed(1)}
            </span>
            <div className="flex-1 h-2 bg-[var(--color-bg-subtle)] rounded-full relative overflow-hidden">
              <div
                className="absolute h-full rounded-full transition-all duration-300"
                style={{
                  left: '0%',
                  right: `${100 - ((d.avg - d.min) / (d.max - d.min + 0.01)) * 100}%`,
                  background: d.constant
                    ? `linear-gradient(90deg, ${COLORS.green}, ${COLORS.green}88)`
                    : `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accent}88)`,
                }}
              />
            </div>
            <span className="text-[var(--color-text-muted)] text-[11px] w-10 text-right font-mono tabular-nums">
              {d.max.toFixed(1)}
            </span>
          </div>
        </div>
      ))}
      <p className="text-[var(--color-text-muted)] text-[11px] mt-4">
        Changing aids = warning. If RARB changes correlate with speed bands, that's intentional live management.
      </p>
    </Card>
  );
}
