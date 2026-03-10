import { useCallback, useRef, useState } from 'react';
import {
  FileDown,
  Flag,
  Radar,
  Stethoscope,
  GitCompare,
  Wrench,
  Upload,
  X,
} from 'lucide-react';
import { useSessionStore } from '../../store/session-store';
import type { SessionAnalysis } from '../../lib/types';
import type { AppView } from '../../lib/ui-types';
import { StatusBadge } from '../shared/StatusBadge';

interface CommandCenterHeaderProps {
  analysis: SessionAnalysis | null;
}

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: typeof Wrench }> = [
  { id: 'optimizer', label: 'Optimizer', icon: Wrench },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'diagnose', label: 'Diagnose', icon: Stethoscope },
];

function severityCount(analysis: SessionAnalysis, severity: SessionAnalysis['recommendations'][number]['severity']): number {
  return analysis.recommendations.filter((item) => item.severity === severity && item.id !== 'all-clear').length;
}

export function CommandCenterHeader({ analysis }: CommandCenterHeaderProps) {
  const {
    appView,
    loadFile,
    reset,
    setAppView,
  } = useSessionStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void loadFile(file);
        event.target.value = '';
      }
    },
    [loadFile],
  );

  const handleExportPDF = useCallback(async () => {
    if (!analysis || exporting) return;
    setExporting(true);
    try {
      const { exportPDF } = await import('../../lib/pdf-export');
      await exportPDF(analysis);
    } finally {
      setExporting(false);
    }
  }, [analysis, exporting]);

  const criticalCount = analysis ? severityCount(analysis, 'CRITICAL') : 0;
  const warningCount = analysis ? severityCount(analysis, 'WARNING') : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-card-border)] bg-[rgba(6,10,18,0.88)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3 xl:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-card-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Flag className="h-4 w-4" />
          </div>
          <div className="hidden sm:block">
            <p className="font-display text-sm font-semibold tracking-tight text-[var(--color-text)]">
              Command Center
            </p>
            {analysis ? (
              <p className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <span>{analysis.header.car} at {analysis.header.track}</span>
                <span className="text-[var(--color-card-border)]">&middot;</span>
                <StatusBadge status={analysis.dataQuality.confidence === 'HIGH' ? 'OK' : analysis.dataQuality.confidence === 'MEDIUM' ? 'HIGH' : 'RISK'} />
                {criticalCount > 0 && (
                  <>
                    <span className="text-[var(--color-card-border)]">&middot;</span>
                    <span className="inline-flex items-center gap-1 text-[var(--color-cyan)]">
                      <Radar className="h-3 w-3" />
                      {criticalCount} critical
                    </span>
                  </>
                )}
                {warningCount > 0 && (
                  <>
                    <span className="text-[var(--color-card-border)]">&middot;</span>
                    <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
                      {warningCount} warning
                    </span>
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">iRacing Setup Optimizer</p>
            )}
          </div>
        </div>

        {/* Nav tabs — centered */}
        <nav className="ml-auto flex items-center gap-1.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = appView === id;
            const disabled = id === 'optimizer' && !analysis;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => setAppView(disabled ? 'landing' : id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-transparent text-[var(--color-text-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
                } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          {analysis && (
            <button
              type="button"
              onClick={() => {
                reset();
              }}
              className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
              title="Clear session"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Clear</span>
            </button>
          )}

          {analysis && (
            <button
              type="button"
              onClick={handleExportPDF}
              disabled={exporting}
              className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{exporting ? 'Exporting...' : 'PDF'}</span>
            </button>
          )}

          <label className="btn-primary inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Load IBT
            <input
              ref={fileRef}
              type="file"
              accept=".ibt"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </header>
  );
}
