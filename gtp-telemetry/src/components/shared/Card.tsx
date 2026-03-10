import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  span?: number;
  className?: string;
  accent?: boolean;
}

export function Card({ title, icon, children, span = 1, className = '', accent = false }: CardProps) {
  return (
    <div
      className={`flat-card rounded-xl p-6 animate-fade-slide-in ${className}`}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <div className="flex items-center gap-2.5 mb-5">
        {icon && (
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--color-accent-dim)] text-black">
            {icon}
          </div>
        )}
        <h3 className="text-[13px] font-semibold text-[var(--color-text)] tracking-wide">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}
