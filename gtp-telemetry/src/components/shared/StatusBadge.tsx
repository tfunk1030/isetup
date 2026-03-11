interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = '#475569';
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold tracking-wider rounded-md px-2 py-0.5"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: color }} />
      {status}
    </span>
  );
}
