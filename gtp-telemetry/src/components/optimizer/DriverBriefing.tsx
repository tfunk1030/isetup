import { useState } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronDown,
  ChevronUp,
  MapPin,
  Play,
} from 'lucide-react';
import { useSessionStore } from '../../store/session-store';

const HANDLING_PRESETS = [
  'Understeer on entry',
  'Understeer mid-corner',
  'Oversteer on exit',
  'High-speed instability',
  'Poor traction',
  'Bottoming',
] as const;

export function DriverBriefing() {
  const {
    parsedData,
    carProfile,
    trackProfile,
    aiDriverFeedback,
    setAIDriverFeedback,
    runAnalysis,
    loading,
    error,
  } = useSessionStore();

  const [expanded, setExpanded] = useState(false);

  if (!parsedData) return null;

  const sessionInfo = parsedData.sessionInfo;
  const drivers = sessionInfo?.DriverInfo?.Drivers || [];
  const carIdx = sessionInfo?.DriverInfo?.DriverCarIdx;
  let carName = '';
  for (const d of drivers) {
    if (d.CarIdx === carIdx && !d.CarIsPaceCar) {
      carName = d.CarScreenName || '';
      break;
    }
  }
  if (!carName) {
    for (const d of drivers) {
      if (!d.CarIsPaceCar) {
        carName = d.CarScreenName || '';
        break;
      }
    }
  }

  const trackName =
    (sessionInfo?.WeekendInfo?.TrackDisplayName as string) || 'Unknown Track';
  const trackConfig =
    (sessionInfo?.WeekendInfo?.TrackConfigName as string) || '';
  const channelCount = Object.keys(parsedData.vars).length;

  const togglePreset = (preset: string) => {
    if (aiDriverFeedback.includes(preset)) {
      setAIDriverFeedback(
        aiDriverFeedback
          .replace(preset, '')
          .replace(/[,;]\s*[,;]/g, ',')
          .replace(/^[,;\s]+|[,;\s]+$/g, '')
          .trim(),
      );
    } else {
      setAIDriverFeedback(
        aiDriverFeedback.trim()
          ? `${aiDriverFeedback.trim()}, ${preset}`
          : preset,
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Session detection — compact bar */}
      <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card)] p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Car className="h-4 w-4 text-[var(--color-accent)]" />
            <span className="font-semibold text-[var(--color-text)]">
              {carProfile?.name || carName || 'Unknown'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-[var(--color-cyan)]" />
            <span className="text-[var(--color-text)]">
              {trackProfile?.name || trackName}
              {trackConfig ? ` — ${trackConfig}` : ''}
            </span>
          </div>
          <span className="text-xs text-[var(--color-text-muted)]">
            {parsedData.recordCount.toLocaleString()} samples &middot; {channelCount} ch &middot; {parsedData.tickRate} Hz
          </span>
        </div>

        {/* Run analysis CTA */}
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="btn-primary flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-lg shadow-[var(--color-accent)]/10 transition-shadow hover:shadow-xl hover:shadow-[var(--color-accent)]/20 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" fill="currentColor" />
                Run Analysis
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs text-[var(--color-text-dim)] transition hover:text-[var(--color-text)]"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {aiDriverFeedback.trim()
              ? 'Handling notes added'
              : 'Add handling notes'}
            <span className="rounded-full bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">
              optional
            </span>
          </button>
        </div>

        {/* Expandable handling feedback */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t border-[var(--color-card-border)] pt-4">
            <div className="flex flex-wrap gap-2">
              {HANDLING_PRESETS.map((preset) => {
                const active = aiDriverFeedback.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => togglePreset(preset)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)] font-semibold text-[var(--color-accent)]'
                        : 'border-[var(--color-card-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <textarea
              value={aiDriverFeedback}
              onChange={(e) => setAIDriverFeedback(e.target.value)}
              placeholder='e.g. "Car pushes hard on entry at T1, rear snaps on fast corner exit..."'
              rows={2}
              className="w-full resize-y rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />

            {aiDriverFeedback.trim() && (
              <button
                type="button"
                onClick={() => setAIDriverFeedback('')}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
              >
                Clear feedback
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-red)]/20 bg-[var(--color-red)]/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-red)]" />
          <p className="text-sm text-[var(--color-red)]">{error}</p>
        </div>
      )}
    </div>
  );
}
