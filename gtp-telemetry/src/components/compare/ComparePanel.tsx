import { useState, useMemo } from 'react';
import { GitCompare, BarChart3, Check } from 'lucide-react';
import { Card } from '../shared/Card';
import { getAllCars } from '../../lib/car-profiles';
import { parseSetupInput, compareSetups } from '../../lib/setup-compare';
import { useSessionStore } from '../../store/session-store';
import type { CompareResult, NormalizedSetup, SetupDiff } from '../../lib/types';

function directionColor(d: SetupDiff['impactDirection']): string {
  if (d === 'positive') return 'var(--color-green)';
  if (d === 'negative') return 'var(--color-red)';
  if (d === 'context-dependent') return 'var(--color-accent)';
  return 'var(--color-text-muted)';
}

function magnitudeLabel(m: SetupDiff['impactMagnitude']): string {
  if (m === 'large') return '\u25C9';
  if (m === 'medium') return '\u25CE';
  return '\u25CB';
}

const GROUP_LABELS: Record<string, string> = {
  aero: 'Aero',
  platform: 'Platform',
  suspension: 'Suspension',
  dampers: 'Dampers',
  alignment: 'Alignment',
  brakes: 'Brakes',
  diff: 'Differential',
  tyres: 'Tyres',
  electronics: 'Electronics',
};

export function ComparePanel() {
  const { analysis, carProfile } = useSessionStore();

  const [textA, setTextA] = useState('');
  const [textB, setTextB] = useState('');
  const [carId, setCarId] = useState<string>(carProfile?.id || '');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useSession, setUseSession] = useState(!!analysis);

  const allCars = useMemo(() => getAllCars(), []);
  const selectedCar = useMemo(
    () => allCars.find((c) => c.id === carId),
    [allCars, carId]
  );

  const handleCompare = () => {
    setError(null);
    setResult(null);

    let setupA: NormalizedSetup;
    if (useSession && analysis) {
      setupA = analysis.normalizedSetup;
    } else {
      const parsed = parseSetupInput(textA, selectedCar);
      if (!parsed) {
        setError('Could not parse Setup A. Paste valid YAML or JSON from iRacing garage export.');
        return;
      }
      setupA = parsed;
    }

    const setupB = parseSetupInput(textB, selectedCar);
    if (!setupB) {
      setError('Could not parse Setup B. Paste valid YAML or JSON from iRacing garage export.');
      return;
    }

    if (setupA.parameters.length === 0 || setupB.parameters.length === 0) {
      setError('One or both setups have no recognized parameters. Make sure you\'re pasting the CarSetup section.');
      return;
    }

    const labelA = useSession && analysis ? `Current (${analysis.header.car})` : 'Setup A';
    const res = compareSetups(setupA, setupB, labelA, 'Setup B');
    setResult(res);
  };

  const groupedDiffs = useMemo(() => {
    if (!result) return [];
    const groups = new Map<string, SetupDiff[]>();
    for (const diff of result.diffs) {
      const existing = groups.get(diff.group) || [];
      existing.push(diff);
      groups.set(diff.group, existing);
    }
    return [...groups.entries()].map(([group, diffs]) => ({
      group,
      label: GROUP_LABELS[group] || group,
      diffs,
    }));
  }, [result]);

  return (
    <div className="space-y-5">
      <Card title="Compare Setups" icon={<GitCompare className="w-4 h-4" />}>
        <p className="text-xs text-[var(--color-text-muted)] mb-5">
          Paste two iRacing setup exports (YAML or JSON) to see parameter-by-parameter differences with handling impact predictions.
          {analysis && ' Your loaded session setup can be used as Setup A.'}
        </p>

        {/* Car selector */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Car (for normalization)</label>
          <select
            value={carId}
            onChange={(e) => setCarId(e.target.value)}
            className="input-field w-full max-w-[300px] text-xs rounded-lg px-3 py-2"
          >
            <option value="">Auto-detect</option>
            {allCars.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Setup inputs */}
        <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Setup A</label>
              {analysis && (
                <button
                  onClick={() => setUseSession(!useSession)}
                  type="button"
                  aria-pressed={useSession}
                  className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    useSession
                      ? 'bg-[var(--color-green-dim)] text-[var(--color-green)] border-[var(--color-green)]/20'
                      : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)] border-[var(--color-card-border)]'
                  }`}
                >
                  {useSession && <Check className="w-3 h-3" />}
                  {useSession ? 'Using session' : 'Use session'}
                </button>
              )}
            </div>
            {useSession && analysis ? (
              <div className="h-[200px] bg-[var(--color-bg-subtle)] border border-[var(--color-card-border)] rounded-xl p-4 overflow-auto">
                <p className="text-xs text-[var(--color-green)] mb-1.5 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Using loaded session setup
                </p>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  {analysis.header.car} — {analysis.normalizedSetup.parameters.length} parameters
                </p>
              </div>
            ) : (
              <textarea
                value={textA}
                onChange={(e) => setTextA(e.target.value)}
                placeholder="Paste iRacing setup YAML or JSON..."
                className="input-field w-full h-[200px] text-[11px] font-mono rounded-xl px-4 py-3 resize-y"
              />
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Setup B</label>
            <textarea
              value={textB}
              onChange={(e) => setTextB(e.target.value)}
              placeholder="Paste iRacing setup YAML or JSON..."
              className="input-field w-full h-[200px] text-[11px] font-mono rounded-xl px-4 py-3 resize-y"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[var(--color-red)]/8 border border-[var(--color-red)]/20 mb-4">
            <p className="text-xs text-[var(--color-red)]">{error}</p>
          </div>
        )}

        <button
          onClick={handleCompare}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl"
        >
          <GitCompare className="w-4 h-4" />
          Compare
        </button>
      </Card>

      {/* Results */}
      {result && (
        <Card title="Comparison Results" icon={<BarChart3 className="w-4 h-4" />}>
          <div className="p-4 rounded-xl bg-[var(--color-bg-subtle)] mb-5">
            <p className="text-xs text-[var(--color-text)]">{result.summary}</p>
          </div>

          {result.diffs.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              No meaningful differences detected between the two setups.
            </p>
          ) : (
            <div className="space-y-5">
              {groupedDiffs.map((group) => (
                <div key={group.group}>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2.5">{group.label}</p>
                  <div className="border border-[var(--color-card-border)] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--color-bg-subtle)]">
                          <th className="text-left px-4 py-2.5 text-[var(--color-text-muted)] font-medium">Parameter</th>
                          <th className="text-right px-4 py-2.5 text-[var(--color-text-muted)] font-medium">{result.setupALabel}</th>
                          <th className="text-right px-4 py-2.5 text-[var(--color-text-muted)] font-medium">{result.setupBLabel}</th>
                          <th className="text-right px-4 py-2.5 text-[var(--color-text-muted)] font-medium">Delta</th>
                          <th className="text-left px-4 py-2.5 text-[var(--color-text-muted)] font-medium">Handling Impact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.diffs.map((diff) => (
                          <tr key={diff.parameterKey} className="border-t border-[var(--color-card-border)] hover:bg-[var(--color-surface)]/30 transition-colors">
                            <td className="px-4 py-2.5 text-[var(--color-text)]">{diff.displayName}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text-dim)]">{diff.setupA.value}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-[var(--color-text)]">{diff.setupB.value}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: directionColor(diff.impactDirection) }}>
                              {diff.delta}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                <span title={diff.impactMagnitude} style={{ color: directionColor(diff.impactDirection) }}>
                                  {magnitudeLabel(diff.impactMagnitude)}
                                </span>
                                <span className="text-[var(--color-text-dim)]">{diff.handlingImpact}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
