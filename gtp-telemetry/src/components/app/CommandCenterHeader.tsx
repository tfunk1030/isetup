import { useCallback, useRef, useState } from 'react';
import {
  FileDown,
  Flag,
  Home,
  Radar,
  Stethoscope,
  GitCompare,
  Wrench,
  Upload,
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

function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

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

  const recommendationCount = analysis
    ? analysis.recommendations.filter((item) => item.id !== 'all-clear').length
    : 0;
  const exactCount = analysis
    ? analysis.recommendations.filter((item) => item.exactness === 'exact' || (item.specifics?.length ?? 0) > 0).length
    : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-card-border)] bg-[rgba(6,10,18,0.88)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-6 py-5 xl:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Flag className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-text-muted)]">
                iRacing Setup Optimizer
              </p>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-text)]">
                Command Center
              </h1>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">
                {analysis
                  ? `${analysis.header.car} at ${analysis.header.track}`
                  : 'Load telemetry or work directly in compare and diagnose mode.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (analysis) reset();
                else setAppView('landing');
              }}
              className="btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs"
            >
              <Home className="h-3.5 w-3.5" />
              {analysis ? 'Clear Session' : 'Landing'}
            </button>

            {analysis && (
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={exporting}
                className="btn-secondary inline-flex items-center gap-2 px-3.5 py-2 text-xs"
              >
                <FileDown className="h-3.5 w-3.5" />
                {exporting ? 'Exporting...' : 'Export PDF'}
              </button>
            )}

            <label className="btn-primary inline-flex cursor-pointer items-center gap-2 px-4 py-2 text-xs">
              <Upload className="h-3.5 w-3.5" />
              {analysis ? 'Load New IBT' : 'Load IBT'}
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

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <nav className="flex flex-wrap items-center gap-2">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = appView === id || (!analysis && id === 'optimizer' && appView === 'landing');
              const disabled = id === 'optimizer' && !analysis;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setAppView(disabled ? 'landing' : id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-card-border)] bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:border-[var(--color-card-border-hover)] hover:text-[var(--color-text)]'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="command-chip">
              <span>Best Lap</span>
              <strong>{analysis ? formatLapTime(analysis.bestTime) : '--'}</strong>
            </div>
            <div className="command-chip">
              <span>Valid Laps</span>
              <strong>{analysis ? analysis.validLaps.length : 0}</strong>
            </div>
            <div className="command-chip">
              <span>Confidence</span>
              {analysis ? <StatusBadge status={analysis.dataQuality.confidence === 'HIGH' ? 'OK' : analysis.dataQuality.confidence === 'MEDIUM' ? 'HIGH' : 'RISK'} /> : <strong>Idle</strong>}
            </div>
            <div className="command-chip">
              <span>Setup Changes</span>
              <strong>{analysis ? `${exactCount}/${recommendationCount}` : '0/0'}</strong>
            </div>
          </div>
        </div>

        {analysis && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <Radar className="h-3.5 w-3.5 text-[var(--color-cyan)]" />
              {severityCount(analysis, 'CRITICAL')} critical
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <Radar className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              {severityCount(analysis, 'WARNING')} warning
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1.5">
              {analysis.header.driver}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1.5">
              {analysis.header.duration} • {analysis.header.hz}Hz • {analysis.header.channels} ch
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
