import { useState, useMemo } from 'react';
import {
  Stethoscope, Search, CornerDownRight, Target, Car, CloudRain, Sun, FileText, Droplets,
} from 'lucide-react';
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

const PHASES: { id: CornerPhase; label: string }[] = [
  { id: 'entry', label: 'Entry' },
  { id: 'mid', label: 'Mid' },
  { id: 'exit', label: 'Exit' },
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
    <div className="space-y-5">
      <Card title="Diagnose Handling Issue" icon={<Stethoscope className="w-4 h-4" />}>
        <p className="text-xs text-[var(--color-text-muted)] mb-5">
          Describe a handling problem — select from the grid below or type in free text. The engine matches diagnostic rules and returns prioritised setup changes.
          {analysis && (
            <span className="text-[var(--color-green)]"> Telemetry loaded — results will cross-reference your session data.</span>
          )}
        </p>

        {/* Car / Track / Wet selectors */}
        <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Car</label>
            <select
              value={carId}
              onChange={(e) => setCarId(e.target.value)}
              className="input-field w-full text-xs rounded-lg px-3 py-2"
            >
              <option value="">Any car</option>
              {allCars.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Track</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="input-field w-full text-xs rounded-lg px-3 py-2"
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
              type="button"
              aria-pressed={isWet}
              className={`inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                isWet
                  ? 'bg-[var(--color-blue-dim)] text-[var(--color-blue)] border-[var(--color-blue)]/30'
                  : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border-[var(--color-card-border)]'
              }`}
            >
              {isWet ? <CloudRain className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              {isWet ? 'Wet' : 'Dry'}
            </button>
          </div>
        </div>

        {/* Symptom selector grid */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Symptom</label>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {SYMPTOMS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSymptom(symptom === s.id ? null : s.id)}
                type="button"
                aria-pressed={symptom === s.id}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  symptom === s.id
                    ? 'bg-[var(--color-accent-glow)] border-[var(--color-accent)] text-[var(--color-accent)] shadow-[0_0_12px_var(--color-accent-glow)]'
                    : 'bg-[var(--color-bg-subtle)] border-[var(--color-card-border)] text-[var(--color-text)] hover:border-[var(--color-card-border-hover)]'
                }`}
              >
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Phase selector */}
        <div className="flex gap-4 mb-5">
          <div className="flex-1">
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Corner Phase</label>
            <div className="flex gap-2">
              {PHASES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPhase(phase === p.id ? null : p.id)}
                  type="button"
                  aria-pressed={phase === p.id}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs py-2 px-3 rounded-lg border transition-all cursor-pointer ${
                    phase === p.id
                      ? 'bg-[var(--color-accent-glow)] border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'bg-[var(--color-bg-subtle)] border-[var(--color-card-border)] text-[var(--color-text-muted)] hover:border-[var(--color-card-border-hover)]'
                  }`}
                >
                  <CornerDownRight className="w-3 h-3" />
                  {p.label}
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
                  type="button"
                  aria-pressed={speed === s.id}
                  className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-all cursor-pointer ${
                    speed === s.id
                      ? 'bg-[var(--color-accent-glow)] border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'bg-[var(--color-bg-subtle)] border-[var(--color-card-border)] text-[var(--color-text-muted)] hover:border-[var(--color-card-border-hover)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Free text input */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Or describe in plain English</label>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="e.g. 'Car pushes on entry at low-speed corners' or 'Oversteer on power at Eau Rouge'"
            className="input-field w-full text-xs rounded-xl px-4 py-3 resize-y min-h-[60px]"
          />
        </div>

        {/* Diagnose button */}
        <button
          onClick={handleDiagnose}
          disabled={!hasInput}
          className={`w-full inline-flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl transition-all ${
            hasInput
              ? 'btn-primary'
              : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] cursor-not-allowed border-none'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          Diagnose
        </button>
      </Card>

      {/* Results */}
      {result && (
        <>
          <Card title="Diagnosis" icon={<Search className="w-4 h-4" />}>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--color-accent-glow)] text-[var(--color-accent)] font-medium">
                {result.matchedSymptom}
              </span>
              {result.matchedPhase && (
                <span className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface)] text-[var(--color-text-dim)]">
                  {result.matchedPhase} phase
                </span>
              )}
              {result.matchedSpeed && (
                <span className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-surface)] text-[var(--color-text-dim)]">
                  {result.matchedSpeed} speed
                </span>
              )}
            </div>

            {result.physicsNote && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--color-blue-dim)] border border-[var(--color-blue)]/20 mb-4">
                <Car className="w-4 h-4 text-[var(--color-blue)] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[var(--color-blue)]">{result.physicsNote}</p>
              </div>
            )}

            {result.parameterChanges.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  Recommended Changes ({result.parameterChanges.length})
                </p>
                {result.parameterChanges.map((change, i) => (
                  <div
                    key={`${change.parameterKey}-${i}`}
                    className="rounded-xl border border-[var(--color-card-border)] p-4 hover:bg-[var(--color-surface)]/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)] rounded-md px-2 py-0.5">
                          #{i + 1}
                        </span>
                        <span className="text-sm font-semibold text-[var(--color-text)]">{change.displayName}</span>
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          color: confidenceColor(change.confidence),
                          backgroundColor: `color-mix(in srgb, ${confidenceColor(change.confidence)} 12%, transparent)`,
                        }}
                      >
                        {change.confidence}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs mb-2">
                      <span className="text-[var(--color-accent)] font-semibold">{change.direction}</span>
                      <span className="text-[var(--color-text-dim)]">{change.magnitude}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mb-1.5">{change.tradeoff}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      Verify: <span className="text-[var(--color-text-dim)]">{change.verifyChannel}</span>
                    </p>
                    {change.telemetryEvidence && (
                      <div className="mt-2 p-2.5 rounded-lg bg-[var(--color-green-dim)] border border-[var(--color-green)]/15">
                        <p className="text-[10px] text-[var(--color-green)] flex items-center gap-1.5">
                          <Target className="w-3 h-3" />
                          {change.telemetryEvidence}
                        </p>
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

          {(result.trackNotes.length > 0 || result.carNotes.length > 0) && (
            <Card title="Context Notes" icon={<FileText className="w-4 h-4" />}>
              {result.trackNotes.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Track Guidance</p>
                  <ul className="text-xs text-[var(--color-text-dim)] space-y-1 list-disc pl-4">
                    {result.trackNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
              {result.carNotes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Car Knowledge</p>
                  <ul className="text-xs text-[var(--color-text-dim)] space-y-1 list-disc pl-4">
                    {result.carNotes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          )}

          {result.wetProtocol && (
            <Card title="Wet Protocol" icon={<Droplets className="w-4 h-4" />}>
              <div className="space-y-3">
                {result.wetProtocol.map((step, i) => (
                  <div key={i} className="flex gap-3 items-start p-3 rounded-xl bg-[var(--color-bg-subtle)]">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-blue-dim)] text-[var(--color-blue)] flex items-center justify-center text-[10px] font-bold">
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
