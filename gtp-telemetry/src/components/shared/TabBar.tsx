import {
  LayoutDashboard, CircleDot, Ruler, Zap, Stethoscope, GitCompare, Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

const ICON_MAP: Record<string, ReactNode> = {
  'layout-dashboard': <LayoutDashboard className="w-4 h-4" />,
  'circle-dot': <CircleDot className="w-4 h-4" />,
  'ruler': <Ruler className="w-4 h-4" />,
  'zap': <Zap className="w-4 h-4" />,
  'stethoscope': <Stethoscope className="w-4 h-4" />,
  'git-compare': <GitCompare className="w-4 h-4" />,
  'wrench': <Wrench className="w-4 h-4" />,
};

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface TabBarProps {
  tabs: readonly Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-card-border)]">
      <div className="max-w-[1440px] mx-auto px-6">
        <div className="flex gap-1 overflow-x-auto py-2 no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border-none text-[13px] font-medium whitespace-nowrap cursor-pointer transition-all duration-200 ${
                activeTab === t.id
                  ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent-glow)]'
                  : 'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-dim)] hover:bg-[var(--color-surface)]'
              }`}
            >
              {ICON_MAP[t.icon]}
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
