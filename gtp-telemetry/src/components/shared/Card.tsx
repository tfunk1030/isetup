import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  span?: number;
  className?: string;
  accent?: boolean;
  accentColor?: string;
  subtitle?: string;
}

export function Card({ title, icon, children, span = 1, className = '', accent = false, accentColor, subtitle }: CardProps) {
  const accentClass = accent || accentColor ? 'flat-card-accent' : '';

  return (
    <div
      className={`flat-card rounded-xl p-6 animate-fade-slide-in ${accentClass} ${className}`}
      style={{
        ...(span > 1 ? { gridColumn: `span ${span}` } : undefined),
        ...(accentColor ? { borderTopColor: accentColor } : undefined),
      }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        {icon && (
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg text-black"
            style={{ background: accentColor || 'var(--color-accent-dim)' }}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-[var(--color-text)] tracking-wide">
            {title}
          </h3>
          {subtitle && (
            <span className="text-[11px] text-[var(--color-text-muted)]">{subtitle}</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
