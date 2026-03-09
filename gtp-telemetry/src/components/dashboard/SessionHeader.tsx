import { useRef, useCallback, useState } from 'react';
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
    <div className="bg-[var(--color-card)] border-b border-[var(--color-card-border)] px-6 py-4 flex justify-between items-center flex-wrap gap-3">
      <div>
        <h1 className="text-xl font-extrabold">
          {'\u{1F3C1}'} GTP <span className="text-[var(--color-accent)]">Telemetry</span>
        </h1>
        <p className="text-[var(--color-text-muted)] text-xs mt-0.5">
          {a.car} — {a.track}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-[var(--color-text-dim)] px-2.5 py-1 bg-[var(--color-bg)] rounded-md">
          {a.driver}
        </span>
        <span className="text-xs text-[var(--color-text-dim)] px-2.5 py-1 bg-[var(--color-bg)] rounded-md">
          {a.duration} &bull; {a.hz}Hz &bull; {a.channels}ch
        </span>
        <span
          className={`text-xs px-2.5 py-1 rounded-md ${
            a.hasBrakeMig
              ? 'bg-[var(--color-green)]/15 text-[var(--color-green)]'
              : 'bg-[var(--color-red)]/15 text-[var(--color-red)]'
          }`}
        >
          Migration: {a.hasBrakeMig ? 'YES' : 'NO'}
        </span>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="text-xs text-[var(--color-green)] px-2.5 py-1 bg-[var(--color-green)]/15 rounded-md cursor-pointer hover:bg-[var(--color-green)]/25 transition-colors border-none"
        >
          {exporting ? 'Exporting...' : 'Export PDF'}
        </button>
        <label className="text-xs text-[var(--color-accent)] px-2.5 py-1 bg-[var(--color-accent-dim)]/20 rounded-md cursor-pointer hover:bg-[var(--color-accent-dim)]/30 transition-colors">
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
  );
}
