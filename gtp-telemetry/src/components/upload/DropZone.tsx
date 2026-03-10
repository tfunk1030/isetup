import { useCallback, useRef, useState } from 'react';
import { ChevronRight, Flag, Upload } from 'lucide-react';
import { useSessionStore } from '../../store/session-store';

const SUPPORTED_CARS = [
  'BMW M Hybrid V8',
  'Porsche 963',
  'Cadillac V-Series.R',
  'Acura ARX-06',
  'Ferrari 499P',
] as const;

export function DropZone() {
  const { loading, progress, error, loadFile } = useSessionStore();
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setLocalError(null);
      if (!file.name.toLowerCase().endsWith('.ibt')) {
        setLocalError('Unsupported file type. Upload an iRacing `.ibt` telemetry file.');
        return;
      }
      if (file.size < 1024) {
        setLocalError('File is too small to be a valid `.ibt` telemetry file.');
        return;
      }
      void loadFile(file);
    },
    [loadFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) handleFile(file);
      event.target.value = '';
    },
    [handleFile],
  );

  return (
    <section className="rounded-[28px] border border-[var(--color-card-border)] bg-[linear-gradient(180deg,rgba(12,19,31,0.98),rgba(7,12,22,0.96))] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Flag className="h-5 w-5" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            Upload Telemetry
          </p>
          <p className="text-sm text-[var(--color-text-dim)]">
            Drop an `.ibt` to open the optimizer workspace.
          </p>
        </div>
      </div>

      <div
        className={`group rounded-[24px] border p-8 transition-all ${
          dragOver
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_0_0_1px_var(--color-accent),0_20px_48px_rgba(245,158,11,0.12)]'
            : 'border-dashed border-[var(--color-card-border-hover)] bg-[rgba(9,15,27,0.7)] hover:border-[var(--color-accent)]/60 hover:bg-[rgba(14,21,35,0.88)]'
        } ${loading ? 'cursor-progress' : 'cursor-pointer'}`}
        role="button"
        tabIndex={0}
        aria-label="Upload iRacing telemetry file"
        aria-disabled={loading}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (loading) return;
          setLocalError(null);
          fileRef.current?.click();
        }}
        onKeyDown={(event) => {
          if (loading) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setLocalError(null);
            fileRef.current?.click();
          }
        }}
      >
        {loading ? (
          <div role="status" aria-live="polite" aria-atomic="true" className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
              <Upload className="h-5 w-5 animate-pulse-glow" />
            </div>
            <div>
              <p className="font-display text-xl font-semibold text-[var(--color-text)]">Analyzing Session</p>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">{progress}</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-line)]">
              <div className="h-full w-1/2 rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-cyan))] animate-progress" />
            </div>
          </div>
        ) : (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--color-card-border)] bg-[var(--color-surface)] text-[var(--color-accent)] transition-transform duration-200 group-hover:scale-[1.03]">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-2xl font-semibold text-[var(--color-text)]">
                Drop `.ibt` Here
              </p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-text-dim)]">
                Load a telemetry run, decode the garage setup, and jump directly into the optimizer queue.
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] px-4 py-3 text-left">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                Typical File Path
              </p>
              <p className="mt-2 flex items-center gap-1 font-mono text-xs text-[var(--color-text-dim)]">
                Documents/iRacing/Telemetry
                <ChevronRight className="h-3 w-3" />
                session.ibt
              </p>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".ibt"
          onChange={handleChange}
          className="hidden"
          disabled={loading}
        />
      </div>

      {(localError || error) && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-2xl border border-[var(--color-red)] bg-[var(--color-red-dim)] px-4 py-3 text-sm text-[var(--color-red)]"
        >
          {localError || error}
        </p>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="upload-fact">
          <strong>Optimizer default</strong>
          <span>Successful uploads land in the setup workspace, not a chart-first dashboard.</span>
        </div>
        <div className="upload-fact">
          <strong>Deterministic first</strong>
          <span>Exact setup changes lead; AI review stays secondary and advisory.</span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUPPORTED_CARS.map((car) => (
          <span
            key={car}
            className="rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] text-[var(--color-text-dim)]"
          >
            {car}
          </span>
        ))}
      </div>
    </section>
  );
}
