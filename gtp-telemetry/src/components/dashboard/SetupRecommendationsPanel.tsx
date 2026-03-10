import { useMemo, useState } from 'react';
import { Brain, ChevronDown, Wind, Ruler, CircleDot, Zap, Shield, OctagonX, Cog, MapPin } from 'lucide-react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import type { RecommendationSeverity, SessionAnalysis, SetupRecommendation } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

const CATEGORY_ICONS: Record<SetupRecommendation['category'], React.ReactNode> = {
  AERO: <Wind className="w-3.5 h-3.5" />,
  PLATFORM: <Ruler className="w-3.5 h-3.5" />,
  TYRES: <CircleDot className="w-3.5 h-3.5" />,
  DYNAMICS: <Zap className="w-3.5 h-3.5" />,
  AIDS: <Shield className="w-3.5 h-3.5" />,
  BRAKES: <OctagonX className="w-3.5 h-3.5" />,
  POWERTRAIN: <Cog className="w-3.5 h-3.5" />,
  TRACK: <MapPin className="w-3.5 h-3.5" />,
};

function severityBorderColor(severity: RecommendationSeverity): string {
  if (severity === 'CRITICAL') return 'var(--color-red)';
  if (severity === 'WARNING') return 'var(--color-accent)';
  return 'var(--color-card-border)';
}

function severityToStatus(severity: RecommendationSeverity): 'OK' | 'HIGH' | 'HOT' {
  if (severity === 'CRITICAL') return 'HOT';
  if (severity === 'WARNING') return 'HIGH';
  return 'OK';
}

function confidenceToStatus(confidence: SetupRecommendation['confidence']): 'OK' | 'HIGH' | 'RISK' {
  if (confidence === 'HIGH') return 'OK';
  if (confidence === 'MEDIUM') return 'HIGH';
  return 'RISK';
}

function exactnessToStatus(exactness: SetupRecommendation['exactness']): 'OK' | 'HIGH' | 'RISK' {
  if (exactness === 'exact') return 'OK';
  if (exactness === 'blocked') return 'RISK';
  return 'HIGH';
}

export function SetupRecommendationsPanel({ analysis }: Props) {
  const { recommendations, dataQuality } = analysis;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const mappedByKey = useMemo(
    () => new Map(analysis.normalizedSetup.parameters.map((parameter) => [parameter.parameterKey, parameter])),
    [analysis.normalizedSetup.parameters],
  );
  const mappingStats = analysis.normalizedSetup.mappingStats;

  const categoryOrder: SetupRecommendation['category'][] = [
    'AERO', 'PLATFORM', 'TYRES', 'DYNAMICS', 'AIDS', 'BRAKES', 'POWERTRAIN', 'TRACK',
  ];

  const grouped = categoryOrder
    .map((category) => ({
      category,
      items: recommendations.filter((r) => r.category === category),
    }))
    .filter((g) => g.items.length > 0);

  const severityCounts = {
    CRITICAL: recommendations.filter((r) => r.severity === 'CRITICAL').length,
    WARNING: recommendations.filter((r) => r.severity === 'WARNING').length,
    INFO: recommendations.filter((r) => r.severity === 'INFO').length,
  };

  const toggle = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <Card title="Setup Recommendations" icon={<Brain className="w-4 h-4" />} accent>
      {/* Constraint violations banner */}
      {analysis.constraintViolations && analysis.constraintViolations.length > 0 && (
        <div className="mb-5 p-4 rounded-xl bg-[var(--color-red)]/8 border border-[var(--color-red)]/20">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-red)] animate-pulse-glow" />
            <span className="text-xs font-bold text-[var(--color-red)] uppercase tracking-wider">
              Sim Constraint Violations ({analysis.constraintViolations.length})
            </span>
          </div>
          <div className="space-y-2">
            {analysis.constraintViolations.map((v) => (
              <div key={v.constraintId} className="text-xs">
                <span className="text-[var(--color-red)] font-semibold">{v.description}</span>
                {v.currentValue !== undefined && (
                  <span className="text-[var(--color-text-muted)]">
                    {' '}(current: {v.currentValue.toFixed(1)} {v.unit}, limit: {v.limit} {v.unit})
                  </span>
                )}
                <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">{v.workaround}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dataset confidence header */}
      <div className="mb-5 p-4 rounded-xl bg-[var(--color-bg-subtle)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[var(--color-text-dim)] text-sm">Dataset confidence</span>
          <StatusBadge status={confidenceToStatus(dataQuality.confidence)} />
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {dataQuality.validLapCount} valid laps &bull; {dataQuality.optionalMissingChannels.length} optional channels missing
        </p>
        <p className="text-[11px] text-[var(--color-text-muted)] mt-1.5">
          Setup mapping: {mappingStats.exact} exact &bull; {mappingStats.ordered} ordered &bull; {mappingStats.ambiguous} ambiguous
        </p>
      </div>

      {/* Severity summary bar */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-5 mb-5 px-4 py-3 rounded-xl bg-[var(--color-bg-subtle)]">
          {severityCounts.CRITICAL > 0 && (
            <span className="flex items-center gap-2 text-xs font-semibold text-[var(--color-red)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-red)]" />
              {severityCounts.CRITICAL} Critical
            </span>
          )}
          {severityCounts.WARNING > 0 && (
            <span className="flex items-center gap-2 text-xs font-semibold text-[var(--color-accent)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
              {severityCounts.WARNING} Warning
            </span>
          )}
          {severityCounts.INFO > 0 && (
            <span className="flex items-center gap-2 text-xs font-semibold text-[var(--color-green)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-green)]" />
              {severityCounts.INFO} Info
            </span>
          )}
          <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">
            {recommendations.length} total
          </span>
        </div>
      )}

      {recommendations.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No actionable setup recommendations generated for this dataset.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.category}>
              <button
                onClick={() => toggle(group.category)}
                className="w-full flex items-center justify-between mb-3 cursor-pointer bg-transparent border-none p-0 text-left"
              >
                <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span className="text-[var(--color-accent)]">{CATEGORY_ICONS[group.category]}</span>
                  {group.category}
                  <span className="bg-[var(--color-bg-subtle)] rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-dim)] ml-1">
                    {group.items.length}
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${collapsed.has(group.category) ? '-rotate-90' : ''}`}
                />
              </button>

              {!collapsed.has(group.category) && (
                <div className="space-y-3">
                  {group.items.map((item) => (
                    (() => {
                      const mappedParameter = item.parameterKey ? mappedByKey.get(item.parameterKey) : undefined;
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-[var(--color-card-border)] border-l-4 p-4 flex gap-3 hover:bg-[var(--color-surface)]/30 transition-colors"
                          style={{ borderLeftColor: severityBorderColor(item.severity) }}
                        >
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-bg-subtle)] flex items-center justify-center">
                            <span className="font-mono text-xs font-bold text-[var(--color-text-dim)]">
                              {item.priority}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <p className="text-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <StatusBadge status={severityToStatus(item.severity)} />
                                <StatusBadge status={confidenceToStatus(item.confidence)} />
                                {item.exactness && <StatusBadge status={exactnessToStatus(item.exactness)} />}
                              </div>
                            </div>
                            <p className="text-sm text-[var(--color-text)] font-medium mb-2">{item.action}</p>
                            <p className="text-xs text-[var(--color-text-muted)] mb-2.5">{item.rationale}</p>
                            {item.exactness && (
                              <p className="text-[11px] text-[var(--color-text-muted)] mb-2.5">
                                {item.exactness === 'exact' && 'Exact change mapped from parsed setup.'}
                                {item.exactness === 'inferred' && 'Directionally inferred from telemetry because the garage parameter could not be mapped exactly.'}
                                {item.exactness === 'blocked' && 'Constrained by missing setup data or a sim limit; see notes below.'}
                              </p>
                            )}
                            {mappedParameter && (
                              <div className="mb-2.5 text-[11px] text-[var(--color-text-muted)]">
                                <p>
                                  Garage path: <span className="font-mono text-[var(--color-text-dim)]">{mappedParameter.sourcePath}</span>
                                  {' '}({mappedParameter.mappingQuality}, {mappedParameter.confidence})
                                </p>
                                {mappedParameter.ambiguousMatches.length > 0 && (
                                  <p className="mt-1">
                                    Alternatives: <span className="font-mono text-[var(--color-text-dim)]">{mappedParameter.ambiguousMatches.join(', ')}</span>
                                  </p>
                                )}
                              </div>
                            )}
                            {item.evidence.length > 0 && (
                              <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-1">
                                {item.evidence.slice(0, 3).map((ev) => (
                                  <li key={ev}>{ev}</li>
                                ))}
                              </ul>
                            )}
                            {item.specifics && item.specifics.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)]/50 space-y-1.5">
                                {item.specifics.map((s) => (
                                  <div key={s.parameter} className="flex items-center gap-2 text-xs">
                                    <span className="text-[var(--color-text-muted)] min-w-0 truncate">{s.parameter}:</span>
                                    <span className="font-mono text-[var(--color-text-dim)]">{s.current}</span>
                                    <span className="text-[var(--color-accent)] font-bold">&rarr;</span>
                                    <span className="font-mono font-semibold text-[var(--color-text)]">{s.target}</span>
                                    <span className="text-[var(--color-text-muted)]">({s.delta})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {item.verify && item.verify.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)]/50">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Verify After Change</p>
                                <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-1">
                                  {item.verify.map((check) => (
                                    <li key={check}>{check}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {item.blockedBy && item.blockedBy.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-[var(--color-card-border)]/50">
                                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Limits</p>
                                <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-1">
                                  {item.blockedBy.map((note) => (
                                    <li key={note}>{note}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
