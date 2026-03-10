import { STATUS_COLORS, type StatusType } from '../../lib/constants';

interface StatusBadgeProps {
  status: StatusType | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status as StatusType] || '#475569';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider rounded px-2 py-0.5 text-zinc-900"
      style={{ background: color }}
    >
      {status}
    </span>
  );
}
