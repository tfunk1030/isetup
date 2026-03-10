import {
  GitCompare,
  Stethoscope,
} from 'lucide-react';
import { DropZone } from '../upload/DropZone';
import { useSessionStore } from '../../store/session-store';

export function LandingScreen() {
  const { setAppView } = useSessionStore();

  return (
    <div className="flex min-h-[calc(100vh-56px)] items-start justify-center pt-[12vh]">
      <div className="mx-auto w-full max-w-xl space-y-6 px-6">
        {/* Compact hero */}
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-text)]">
            Setup Optimizer
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Upload an <code className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-xs">.ibt</code> to decode your setup, get prioritized changes, and review telemetry evidence.
          </p>
        </div>

        {/* Drop zone — the primary action */}
        <DropZone />

        {/* Quick tools */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAppView('diagnose')}
            className="tool-launch"
          >
            <span className="tool-launch-icon">
              <Stethoscope className="h-4 w-4" />
            </span>
            <span>
              <strong>Diagnose</strong>
              <small>Symptom to setup changes</small>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAppView('compare')}
            className="tool-launch"
          >
            <span className="tool-launch-icon">
              <GitCompare className="h-4 w-4" />
            </span>
            <span>
              <strong>Compare</strong>
              <small>Diff two setups</small>
            </span>
          </button>
        </div>

        {/* Supported cars — minimal */}
        <p className="text-center text-xs text-[var(--color-text-muted)]">
          BMW M Hybrid V8 &middot; Porsche 963 &middot; Cadillac V-Series.R &middot; Acura ARX-06 &middot; Ferrari 499P
        </p>
      </div>
    </div>
  );
}
