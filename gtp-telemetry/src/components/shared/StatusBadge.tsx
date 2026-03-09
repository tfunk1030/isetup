import { STATUS_COLORS, type StatusType } from '../../lib/constants';

interface StatusBadgeProps {
  status: StatusType | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status as StatusType] || '#64748b';
  return (
    <span
      className="inline-block text-white text-[11px] font-bold tracking-wider rounded px-2 py-0.5"
      style={{ background: color }}
    >
      {status}
    </span>
  );
}
