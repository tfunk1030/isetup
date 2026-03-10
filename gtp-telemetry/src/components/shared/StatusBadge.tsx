import { STATUS_COLORS, type StatusType } from '../../lib/constants';

interface StatusBadgeProps {
  status: StatusType | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status as StatusType] || '#475569';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider rounded-full px-2.5 py-0.5"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      {status}
    </span>
  );
}
