import { StatusBadge } from './StatusBadge';

interface MetricRowProps {
  label: string;
  value: string | number | undefined;
  unit?: string;
  status?: string;
}

export function MetricRow({ label, value, unit, status }: MetricRowProps) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[var(--color-card-border)]">
      <span className="text-[var(--color-text-dim)] text-[13px]">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-text)] text-sm font-semibold font-mono">
          {value}
          {unit && (
            <span className="text-[var(--color-text-muted)] font-normal"> {unit}</span>
          )}
        </span>
        {status && <StatusBadge status={status} />}
      </div>
    </div>
  );
}
