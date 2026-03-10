import { useRef, useCallback, useState } from 'react';
import { Flag, FileDown, Upload, FlaskConical, Cog } from 'lucide-react';
import { useSessionStore } from '../../store/session-store';

export function SessionHeader() {
  const { analysis, loadFile } = useSessionStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleExportPDF = async () => {
    if (!analysis || exporting) return;
    setExporting(true);
    try {
      const { exportPDF } = await import('../../lib/pdf-export');
      await exportPDF(analysis);
    } finally {
      setExporting(false);
    }
  };

  if (!analysis) return null;
  const a = analysis.header;

  return (
    <div className="bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-card-border)] px-6 py-4">
      <div className="max-w-[1440px] mx-auto flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--color-accent-glow)]">
            <Flag className="w-5 h-5 text-[var(--color-accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              GTP <span className="text-[var(--color-accent)]">Telemetry</span>
            </h1>
            <p className="text-[var(--color-text-muted)] text-xs mt-0.5">
              {a.car} &mdash; {a.track}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-[var(--color-text-dim)] px-3 py-1.5 bg-[var(--color-surface)] rounded-lg font-medium">
            {a.driver}
          </span>
          <span className="text-xs text-[var(--color-text-dim)] px-3 py-1.5 bg-[var(--color-surface)] rounded-lg font-mono">
            {a.duration} &bull; {a.hz}Hz &bull; {a.channels}ch
          </span>
          <span
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
              a.hasBrakeMig
                ? 'bg-[var(--color-green)]/12 text-[var(--color-green)]'
                : 'bg-[var(--color-red)]/12 text-[var(--color-red)]'
            }`}
          >
            Migration: {a.hasBrakeMig ? 'YES' : 'NO'}
          </span>
          {analysis.physicsVersionNote && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-blue-dim)] text-[var(--color-blue)]">
              <FlaskConical className="w-3.5 h-3.5" />
              {analysis.physicsVersionNote.split(':')[0] || 'Physics'}
            </span>
          )}
          {analysis.normalizedSetup.architecture !== 'unknown' && (
            <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-500/12 text-[var(--color-purple)]">
              <Cog className="w-3.5 h-3.5" />
              {analysis.normalizedSetup.architecture.toUpperCase()}
            </span>
          )}

          <div className="flex gap-2 ml-2">
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            >
              <FileDown className="w-3.5 h-3.5" />
              {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
            <label className="btn-primary inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              New IBT
              <input
                ref={fileRef}
                type="file"
                accept=".ibt"
                onChange={handleChange}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
