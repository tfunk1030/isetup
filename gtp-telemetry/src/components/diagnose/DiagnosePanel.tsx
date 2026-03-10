import { useState, useMemo } from 'react';
import { Card } from '../shared/Card';
import { getAllCars } from '../../lib/car-profiles';
import { getAllTracks } from '../../lib/track-profiles';
import { diagnose } from '../../lib/diagnose-engine';
import { useSessionStore } from '../../store/session-store';
import type {
  CornerPhase,
  HandlingSymptom,
  SpeedRegime,
  DiagnoseResult,
  ConfidenceLevel,
} from '../../lib/types';

const PHASES: { id: CornerPhase; label: string; icon: string }[] = [
  { id: 'entry', label: 'Entry', icon: '\u21A9\uFE0F' },
  { id: 'mid', label: 'Mid', icon: '\u{1F3AF}' },
  { id: 'exit', label: 'Exit', icon: '\u{1F3CE}\uFE0F' },
];

const SYMPTOMS: { id: HandlingSymptom; label: string; desc: string }[] = [
  { id: 'understeer', label: 'Understeer', desc: 'Push / won\'t rotate' },
  { id: 'oversteer', label: 'Oversteer', desc: 'Loose / snap / tail out' },
  { id: 'instability', label: 'Instability', desc: 'Nervous / floaty' },
  { id: 'traction-loss', label: 'Traction Loss', desc: 'Wheelspin / no grip' },
  { id: 'bottoming', label: 'Bottoming', desc: 'Scraping / platform collapse' },
];

const SPEEDS: { id: SpeedRegime; label: string }[] = [
  { id: 'low', label: 'Low Speed' },
  { id: 'mid', label: 'Mid Speed' },
  { id: 'high', label: 'High Speed' },
];

function confidenceColor(c: ConfidenceLevel): string {
  if (c === 'HIGH') return 'var(--color-green)';
  if (c === 'MEDIUM') return 'var(--color-accent)';
  return 'var(--color-red)';
}

export function DiagnosePanel() {
  const { analysis, carProfile, trackProfile } = useSessionStore();

  const [phase, setPhase] = useState<CornerPhase | null>(null);
  const [symptom, setSymptom] = useState<HandlingSymptom | null>(null);
  const [speed, setSpeed] = useState<SpeedRegime | null>(null);
  const [carId, setCarId] = useState<string>(carProfile?.id || '');
  const [trackId, setTrackId] = useState<string>(trackProfile?.id || '');
  const [isWet, setIsWet] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const allCars = useMemo(() => getAllCars(), []);
  const allTracks = useMemo(() => getAllTracks(), []);

  const handleDiagnose = () => {
    const input = {
      freeText: freeText.trim() || undefined,
      phase: phase || undefined,
      symptom: symptom || undefined,
      speedRegime: speed || undefined,
      carId: carId || undefined,
      trackId: trackId || undefined,
      isWet,
    };
    const res = diagnose(input, analysis || undefined);
    setResult(res);
  };

  const hasInput = phase || symptom || speed || freeText.trim();

  return (
    <div className="space-y-4">
      <Card title="Diagnose Handling Issue" icon={'\u{1FA7A}'}>
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Describe a handling problem — select from the grid below or type in free text. The engine matches diagnostic rules and returns prioritised setup changes.
          {analysis && (
            <span className="text-[var(--color-green)]"> Telemetry loaded — results will cross-reference your session data.</span>
          )}
        </p>

        {/* Car / Track / Wet selectors */}
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Car</label>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              className="w-full text-xs bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-card-border)] rounded-md px-2 py-1.5"
            >
              <option value="">Any car</option>
              {allCars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Track</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="w-full text-xs bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-card-border)] rounded-md px-2 py-1.5"
            >
              <option value="">Any track</option>
              {allTracks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setIsWet(!isWet)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                isWet
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-card-border)]'
              }`}
            >
              {isWet ? '\u{1F327}\uFE0F Wet' : '\u2600\uFE0F Dry'}
            </button>
          </div>
        </div>

        {/* Symptom selector grid */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Symptom</label>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {SYMPTOMS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSymptom(symptom === s.id ? null : s.id)}
                className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  symptom === s.id
                    ? 'bg-[var(--color-accent-dim)]/20 border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-bg)] border-[var(--color-card-border)] text-[var(--color-text)]'
                }`}
              >
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Phase selector */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Corner Phase</label>
            <div className="flex gap-2">
              {PHASES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPhase(phase === p.id ? null : p.id)}
                  className={`flex-1 text-xs py-1.5 px-3 rounded-md border transition-colors cursor-pointer ${
                    phase === p.id
                      ? 'bg-[var(--color-accent-dim)]/20 border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'bg-[var(--color-bg)] border-[var(--color-card-border)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Speed Regime</label>
            <div className="flex gap-2">
              {SPEEDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSpeed(speed === s.id ? null : s.id)}
                  className={`flex-1 text-xs py-1.5 px-3 rounded-md border transition-colors cursor-pointer ${
                    speed === s.id
                      ? 'bg-[var(--color-accent-dim)]/20 border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'bg-[var(--color-bg)] border-[var(--color-card-border)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Free text input */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Or describe in plain English</label>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="e.g. 'Car pushes on entry at low-speed corners' or 'Oversteer on power at Eau Rouge'"
            className="w-full text-xs bg-[var(--color-bg)] text-[var(--color-text)] border border-[var(--color-card-border)] rounded-md px-3 py-2 resize-y min-h-[60px] placeholder:text-[var(--color-text-muted)]/50"
          />
        </div>

        {/* Diagnose button */}
        <button
          onClick={handleDiagnose}
          disabled={!hasInput}
          className={`w-full text-sm font-semibold py-2.5 rounded-lg border-none transition-colors cursor-pointer ${
            hasInput
              ? 'bg-[var(--color-accent)] text-[var(--color-bg)] hover:opacity-90'
              : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] cursor-not-allowed'
          }`}
        >
          {'\u{1FA7A}'} Diagnose
        </button>
      </Card>

      {/* Results */}
      {result && (
        <>
          {/* Matched context */}
          <Card title="Diagnosis" icon={'\u{1F50D}'}>
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-xs px-2.5 py-1 rounded-md bg-[var(--color-accent-dim)]/20 text-[var(--color-accent)]">
                {result.matchedSymptom}
              </span>
              {result.matchedPhase && (
                <span className="text-xs px-2.5 py-1 rounded-md bg-[var(--color-bg)] text-[var(--color-text-dim)]">
                  {result.matchedPhase} phase
                </span>
              )}
              {result.matchedSpeed && (
                <span className="text-xs px-2.5 py-1 rounded-md bg-[var(--color-bg)] text-[var(--color-text-dim)]">
                  {result.matchedSpeed} speed
                </span>
              )}
            </div>

            {result.physicsNote && (
              <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-3">
                <p className="text-xs text-blue-400">{'\u{1F9EA}'} {result.physicsNote}</p>
              </div>
            )}

            {/* Parameter changes */}
            {result.parameterChanges.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Recommended Changes ({result.parameterChanges.length})
                </p>
                {result.parameterChanges.map((change, i) => (
                  <div
                    key={`${change.parameterKey}-${i}`}
                    className="rounded-lg border border-[var(--color-card-border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg)] rounded px-1.5 py-0.5">
                          #{i + 1}
                        </span>
                        <span className="text-sm font-semibold text-[var(--color-text)]">{change.displayName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            color: confidenceColor(change.confidence),
                            backgroundColor: `color-mix(in srgb, ${confidenceColor(change.confidence)} 15%, transparent)`,
                          }}
                        >
                          {change.confidence}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs mb-1.5">
                      <span className="text-[var(--color-accent)] font-semibold">{change.direction}</span>
                      <span className="text-[var(--color-text-dim)]">{change.magnitude}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-1">{change.tradeoff}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      Verify: <span className="text-[var(--color-text-dim)]">{change.verifyChannel}</span>
                    </p>
                    {change.telemetryEvidence && (
                      <div className="mt-1.5 p-1.5 rounded bg-[var(--color-green)]/10 border border-[var(--color-green)]/20">
                        <p className="text-[10px] text-[var(--color-green)]">{'\u{1F4CA}'} {change.telemetryEvidence}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                No specific parameter changes matched. Try selecting a more specific phase and speed combination.
              </p>
            )}
          </Card>

          {/* Track & Car notes */}
          {(result.trackNotes.length > 0 || result.carNotes.length > 0) && (
            <Card title="Context Notes" icon={'\u{1F4DD}'}>
              {result.trackNotes.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Track Guidance</p>
                  <ul className="text-xs text-[var(--color-text-dim)] space-y-0.5 list-disc pl-4">
                    {result.trackNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
              {result.carNotes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Car Knowledge</p>
                  <ul className="text-xs text-[var(--color-text-dim)] space-y-0.5 list-disc pl-4">
                    {result.carNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {/* Wet protocol */}
          {result.wetProtocol && (
            <Card title="Wet Protocol" icon={'\u{1F327}\uFE0F'}>
              <div className="space-y-2">
                {result.wetProtocol.map((step, i) => (
                  <div key={i} className="flex gap-3 items-start p-2.5 rounded-lg bg-[var(--color-bg)]">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text)]">{step.action}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{step.magnitude}</p>
                      <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">{step.rationale}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
