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
    <div className="flex gap-0 bg-[var(--color-card)] border-b border-[var(--color-card-border)] overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          className={`px-5 py-3 border-none bg-transparent text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors border-b-2 ${
            activeTab === t.id
              ? 'text-[var(--color-accent)] border-[var(--color-accent)]'
              : 'text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-dim)]'
          }`}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}
