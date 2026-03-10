import { STATUS_COLORS, type StatusType } from '../../lib/constants';

interface StatusBadgeProps {
  status: StatusType | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status as StatusType] || '#475569';
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider rounded-md px-2 py-0.5"
      style={{
        background: `${color}20`,
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {status}
    </span>
  );
}
