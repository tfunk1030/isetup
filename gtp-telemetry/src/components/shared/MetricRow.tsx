import { StatusBadge } from './StatusBadge';

interface MetricRowProps {
  label: string;
  value: string | number | undefined;
  unit?: string;
  status?: string;
}

export function MetricRow({ label, value, unit, status }: MetricRowProps) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[var(--color-card-border)]/50 last:border-b-0 group">
      <span className="text-[var(--color-text-muted)] text-[13px] group-hover:text-[var(--color-text-dim)] transition-colors">
        {label}
      </span>
      <div className="flex items-center gap-2.5">
        <span className="text-[var(--color-text)] text-sm font-semibold font-mono tabular-nums">
          {value}
          {unit && (
            <span className="text-[var(--color-text-muted)] font-normal text-xs ml-1">{unit}</span>
          )}
        </span>
        {status && <StatusBadge status={status} />}
      </div>
    </div>
  );
}
