import { useCallback, useRef, useState } from 'react';
import { Upload, Flag, ChevronRight } from 'lucide-react';
import { useSessionStore } from '../../store/session-store';

export function DropZone() {
  const { loading, progress, error, loadFile } = useSessionStore();
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const combinedError = localError || error;

  const handleFile = useCallback(
    (file: File) => {
      setLocalError(null);
      if (!file.name.toLowerCase().endsWith('.ibt')) {
        setLocalError('Unsupported file type. Please upload an iRacing .ibt telemetry file.');
        return;
      }
      if (file.size < 1024) {
        setLocalError('File is too small to be a valid .ibt telemetry file.');
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
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-lg w-full animate-slide-up">
        {/* Logo and branding */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-accent-glow)] mb-6">
          <Flag className="w-8 h-8 text-[var(--color-accent)]" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">
          GTP <span className="text-[var(--color-accent)]">Telemetry</span>
        </h1>
        <p className="text-[var(--color-text-muted)] text-sm mb-10">
          iRacing Hypercar Setup Analysis &mdash; 14-Item Engineering Checklist
        </p>

        {/* Drop zone */}
        <div
          className={`relative rounded-2xl p-14 mb-8 transition-all duration-300 cursor-pointer group ${
            dragOver
              ? 'border-2 border-[var(--color-accent)] bg-[var(--color-accent-glow)] shadow-[0_0_40px_var(--color-accent-glow)]'
              : 'border-2 border-dashed border-[var(--color-card-border)] hover:border-[var(--color-card-border-hover)] hover:bg-[var(--color-card)]'
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
              <div className="text-[var(--color-accent)] text-lg font-bold mb-3">
                Analyzing...
              </div>
              <div className="text-[var(--color-text-dim)] text-sm mb-4">{progress}</div>
              <div className="h-1.5 bg-[var(--color-card-border)] rounded-full overflow-hidden max-w-xs mx-auto">
                <div className="h-full w-1/2 bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-dim)] rounded-full animate-progress" />
              </div>
            </div>
          ) : (
            <div>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-surface)] mb-4 group-hover:bg-[var(--color-card-hover)] transition-colors">
                <Upload className="w-5 h-5 text-[var(--color-text-dim)] group-hover:text-[var(--color-accent)] transition-colors" />
              </div>
              <div className="text-[var(--color-text-dim)] text-base mb-2 font-medium">
                Drop <span className="font-mono text-[var(--color-accent)]">.ibt</span> file here or click to browse
              </div>
              <div className="text-[var(--color-text-muted)] text-xs flex items-center justify-center gap-1">
                <span className="font-mono">Documents/iRacing/Telemetry/</span>
                <ChevronRight className="w-3 h-3" />
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

        <div aria-live="polite" role="status">
          {combinedError && (
            <p className="text-[var(--color-red)] text-sm mb-4 px-4 py-3 rounded-xl bg-[var(--color-red-dim)] border border-[var(--color-red)]/20">
              {combinedError}
            </p>
          )}
        </div>

        {/* Supported cars */}
        <div className="flex gap-2 justify-center flex-wrap">
          {['BMW M Hybrid V8', 'Porsche 963', 'Cadillac V-Series.R', 'Acura ARX-06', 'Ferrari 499P'].map(
            (car) => (
              <span
                key={car}
                className="text-[var(--color-text-muted)] text-[11px] px-3 py-1.5 border border-[var(--color-card-border)] rounded-full hover:border-[var(--color-card-border-hover)] hover:text-[var(--color-text-dim)] transition-colors"
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
