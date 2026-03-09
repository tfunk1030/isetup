import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  icon: string;
  children: ReactNode;
  span?: number;
  className?: string;
}

export function Card({ title, icon, children, span = 1, className = '' }: CardProps) {
  return (
    <div
      className={`bg-[var(--color-card)] border border-[var(--color-card-border)] rounded-xl p-5 ${className}`}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-bold text-[var(--color-accent)] uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}
