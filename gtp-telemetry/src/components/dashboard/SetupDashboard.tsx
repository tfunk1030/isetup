import { useMemo, lazy, Suspense } from 'react';
import {
  Wind, Ruler, Cog, SlidersHorizontal, Target, OctagonX,
  CircleDot, Zap, CheckCircle2, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import type { SessionAnalysis, SetupParameterGroup, NormalizedSetupParameter } from '../../lib/types';

const SetupRecommendationsPanel = lazy(() =>
  import('./SetupRecommendationsPanel').then((m) => ({ default: m.SetupRecommendationsPanel }))
);

interface Props {
  analysis: SessionAnalysis;
}

const GROUP_CONFIG: Record<SetupParameterGroup, {
  label: string;
  icon: React.ReactNode;
  color: string;
  order: number;
}> = {
  aero:        { label: 'Aero',        icon: <Wind className="w-4 h-4" />,               color: '#60a5fa', order: 0 },
  platform:    { label: 'Platform',    icon: <Ruler className="w-4 h-4" />,              color: '#a78bfa', order: 1 },
  suspension:  { label: 'Suspension',  icon: <Cog className="w-4 h-4" />,                color: '#22d3ee', order: 2 },
  dampers:     { label: 'Dampers',     icon: <SlidersHorizontal className="w-4 h-4" />,  color: '#f59e0b', order: 3 },
  alignment:   { label: 'Alignment',   icon: <Target className="w-4 h-4" />,             color: '#4ade80', order: 4 },
  brakes:      { label: 'Brakes',      icon: <OctagonX className="w-4 h-4" />,           color: '#f87171', order: 5 },
  diff:        { label: 'Differential',icon: <CircleDot className="w-4 h-4" />,          color: '#fbbf24', order: 6 },
  tyres:       { label: 'Tyres',       icon: <CircleDot className="w-4 h-4" />,          color: '#fb923c', order: 7 },
  electronics: { label: 'Electronics', icon: <Zap className="w-4 h-4" />,                color: '#818cf8', order: 8 },
};

export function SetupDashboard({ analysis }: Props) {
  const { normalizedSetup, telemetryReasoning, recommendations } = analysis;

  const grouped = useMemo(() => {
    const map = new Map<SetupParameterGroup, NormalizedSetupParameter[]>();
    for (const p of normalizedSetup.parameters) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return [...map.entries()]
      .sort((a, b) => (GROUP_CONFIG[a[0]]?.order ?? 99) - (GROUP_CONFIG[b[0]]?.order ?? 99));
  }, [normalizedSetup.parameters]);

  const stableSignals = useMemo(
    () => telemetryReasoning.filter(s => s.direction === 'stable'),
    [telemetryReasoning],
  );
  const riskSignals = useMemo(
    () => telemetryReasoning.filter(s => s.direction !== 'stable'),
    [telemetryReasoning],
  );

  const hasParams = normalizedSetup.parameters.length > 0;
  const { mappingStats, architecture } = normalizedSetup;

  return (
    <div className="space-y-6">
      {/* Mapping stats bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-card-border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
          {architecture.toUpperCase()} Setup
        </span>
        <span className="w-px h-4 bg-[var(--color-card-border)]" />
        <span className="text-xs text-[var(--color-text-muted)]">
          {normalizedSetup.parameters.length} parameters mapped
        </span>
        {mappingStats.exact > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-green)]/15 text-[var(--color-green)] border border-[var(--color-green)]/20">
            {mappingStats.exact} exact
          </span>
        )}
        {mappingStats.ordered > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
            {mappingStats.ordered} ordered
          </span>
        )}
        {mappingStats.ambiguous > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-red)]/15 text-[var(--color-red)] border border-[var(--color-red)]/20">
            {mappingStats.ambiguous} ambiguous
          </span>
        )}
        {normalizedSetup.missingKeys.length > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--color-red)]/15 text-[var(--color-red)] border border-[var(--color-red)]/20">
            {normalizedSetup.missingKeys.length} missing
          </span>
        )}
      </div>

      {/* Parameter groups grid */}
      {hasParams ? (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
          {grouped.map(([group, params]) => {
            const config = GROUP_CONFIG[group];
            if (!config) return null;
            return (
              <Card
                key={group}
                title={config.label}
                icon={config.icon}
                subtitle={`${params.length} parameter${params.length !== 1 ? 's' : ''}`}
                accentColor={config.color}
              >
                {params.map((p) => (
                  <MetricRow
                    key={p.parameterKey}
                    label={p.displayName}
                    value={p.displayValue}
                    unit={p.unit}
                    corner={p.corner}
                    confidence={p.confidence}
                  />
                ))}
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-card-border)]">
          <p className="text-sm text-[var(--color-text-muted)]">
            Setup parameters could not be mapped for this session.
          </p>
        </div>
      )}

      {/* Telemetry findings */}
      {telemetryReasoning.length > 0 && (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
          <Card
            title="Looking Good"
            icon={<CheckCircle2 className="w-4 h-4" />}
            accentColor="var(--color-green)"
            subtitle={`${stableSignals.length} signal${stableSignals.length !== 1 ? 's' : ''}`}
          >
            {stableSignals.length > 0 ? stableSignals.map((s) => (
              <div key={s.id} className="py-2.5 border-b border-[var(--color-card-border)]/50 last:border-b-0">
                <p className="text-sm text-[var(--color-text)]">{s.summary}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {s.phase} phase &bull; {s.confidence.toLowerCase()} confidence
                </p>
              </div>
            )) : (
              <p className="text-xs text-[var(--color-text-muted)] py-3">No stable signals detected</p>
            )}
          </Card>

          <Card
            title="Issues Found"
            icon={<AlertTriangle className="w-4 h-4" />}
            accentColor="var(--color-red)"
            subtitle={`${riskSignals.length} signal${riskSignals.length !== 1 ? 's' : ''}`}
          >
            {riskSignals.length > 0 ? riskSignals.map((s) => (
              <div key={s.id} className="py-2.5 border-b border-[var(--color-card-border)]/50 last:border-b-0">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      background: s.direction.includes('risk') ? 'var(--color-red)' : 'var(--color-accent)',
                    }}
                  />
                  <div>
                    <p className="text-sm text-[var(--color-text)]">{s.summary}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {s.phase} &bull; {s.direction.replace(/-/g, ' ')} &bull; {s.confidence.toLowerCase()}
                    </p>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-xs text-[var(--color-text-muted)] py-3">No issues detected</p>
            )}
          </Card>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Suspense fallback={
          <div className="flex items-center gap-3 px-4 py-6">
            <div className="w-4 h-4 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
            <span className="text-sm text-[var(--color-text-muted)]">Loading recommendations...</span>
          </div>
        }>
          <SetupRecommendationsPanel analysis={analysis} />
        </Suspense>
      )}

      {/* Raw setup data toggle */}
      <details className="rounded-xl bg-[var(--color-bg-subtle)] border border-[var(--color-card-border)] overflow-hidden">
        <summary className="cursor-pointer p-4 text-xs text-[var(--color-text-muted)] font-semibold uppercase tracking-wider flex items-center gap-2 hover:text-[var(--color-text-dim)] transition-colors select-none">
          <ChevronRight className="w-3.5 h-3.5 transition-transform [details[open]_&]:rotate-90" />
          Raw Setup Data ({analysis.setup.length} entries)
        </summary>
        <div className="max-h-[400px] overflow-auto font-mono text-xs leading-7 p-4 border-t border-[var(--color-card-border)]">
          {analysis.setup.map(([k, v], i) => (
            <div
              key={i}
              className="flex border-b border-[var(--color-card-border)]/50 py-0.5 hover:bg-[var(--color-surface)] rounded px-2 transition-colors"
            >
              <span className="text-[var(--color-text-dim)] min-w-[340px] shrink-0">
                {k as string}
              </span>
              <span className="text-[var(--color-text)] font-semibold">
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
