import { useCallback, useRef, useState } from 'react';
import { useSessionStore } from '../../store/session-store';

export function DropZone() {
  const { loading, progress, error, loadFile } = useSessionStore();
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.ibt')) {
        return;
      }
      if (file.size < 1024) {
        return;
      }
      loadFile(file);
    },
    [loadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-xl">
        <div className="text-5xl mb-2">{'\u{1F3C1}'}</div>
        <h1 className="text-[32px] font-extrabold tracking-tight mb-1">
          GTP <span className="text-[var(--color-accent)]">Telemetry</span>
        </h1>
        <p className="text-[var(--color-text-muted)] text-sm mb-8">
          iRacing Hypercar Setup Analysis — 14-Item Engineering Checklist
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-12 mb-6 transition-colors cursor-pointer ${
            dragOver
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
              : 'border-[var(--color-card-border)] hover:border-[var(--color-text-muted)]'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          {loading ? (
            <div>
              <div className="text-[var(--color-accent)] text-lg font-bold mb-2">
                Analyzing...
              </div>
              <div className="text-[var(--color-text-dim)] text-sm">{progress}</div>
              <div className="mt-4 h-1 bg-[var(--color-card-border)] rounded overflow-hidden max-w-xs mx-auto">
                <div className="h-full bg-[var(--color-accent)] rounded animate-pulse w-2/3" />
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[var(--color-text-dim)] text-base mb-2">
                Drop .ibt file here or click to browse
              </div>
              <div className="text-[var(--color-text-muted)] text-xs">
                Documents/iRacing/Telemetry/
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".ibt"
            onChange={handleChange}
            className="hidden"
          />
        </div>

        {error && (
          <p className="text-[var(--color-red)] text-sm mb-4">{error}</p>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          {['BMW M Hybrid V8', 'Porsche 963', 'Cadillac V-Series.R', 'Acura ARX-06', 'Ferrari 499P'].map(
            (car) => (
              <span
                key={car}
                className="text-[var(--color-text-muted)] text-[11px] px-2.5 py-1 border border-[var(--color-card-border)] rounded-full"
              >
                {car}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
