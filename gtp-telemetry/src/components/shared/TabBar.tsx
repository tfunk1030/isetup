import {
  LayoutDashboard, CircleDot, Ruler, Zap, Stethoscope, GitCompare, Wrench,
} from 'lucide-react';
import {
  useCallback, useRef, type KeyboardEvent, type ReactNode,
} from 'react';
import { getTabId, getTabPanelId } from '../../lib/tab-a11y';

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
  ariaLabel?: string;
}

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = 'Telemetry sections',
}: TabBarProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activateByIndex = useCallback((index: number) => {
    if (tabs.length === 0) return;
    const wrappedIndex = (index + tabs.length) % tabs.length;
    const nextTab = tabs[wrappedIndex];
    if (!nextTab) return;
    onTabChange(nextTab.id);
    tabRefs.current[wrappedIndex]?.focus();
  }, [onTabChange, tabs]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (tabs.length === 0) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      activateByIndex(index + 1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      activateByIndex(index - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      activateByIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      activateByIndex(tabs.length - 1);
    }
  }, [activateByIndex, tabs.length]);

  return (
    <div className="sticky top-0 z-20 bg-[var(--color-bg)] border-b border-[var(--color-card-border)]">
      <div className="max-w-[1440px] mx-auto px-6">
        <div
          className="flex gap-4 overflow-x-auto py-0 no-scrollbar"
          role="tablist"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
        >
          {tabs.map((t, index) => (
            <button
              key={t.id}
              type="button"
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              id={getTabId(t.id)}
              aria-selected={activeTab === t.id}
              aria-controls={getTabPanelId(t.id)}
              tabIndex={activeTab === t.id ? 0 : -1}
              onClick={() => onTabChange(t.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`flex items-center gap-2 px-1 py-4 border-b-2 text-[13px] font-medium whitespace-nowrap cursor-pointer transition-all duration-200 ${
                activeTab === t.id
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-dim)] hover:border-[var(--color-card-border-hover)]'
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
