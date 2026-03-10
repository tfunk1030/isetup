import { useState } from 'react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import type { RecommendationSeverity, SessionAnalysis, SetupRecommendation } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

const CATEGORY_ICONS: Record<SetupRecommendation['category'], string> = {
  AERO: '\u{1F4A8}',
  PLATFORM: '\u{1F4D0}',
  TYRES: '\u{1F6DE}',
  DYNAMICS: '\u26A1',
  AIDS: '\u{1F6E1}\uFE0F',
  BRAKES: '\u{1F6D1}',
  POWERTRAIN: '\u2699\uFE0F',
  TRACK: '\u{1F3CE}\uFE0F',
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
    <Card title="Setup Recommendations" icon={'\u{1F9E0}'}>
      {/* Constraint violations banner */}
      {analysis.constraintViolations && analysis.constraintViolations.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--color-red)]/10 border border-[var(--color-red)]/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-red)]" />
            <span className="text-xs font-bold text-[var(--color-red)] uppercase tracking-wider">
              Sim Constraint Violations ({analysis.constraintViolations.length})
            </span>
          </div>
          <div className="space-y-1.5">
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
      <div className="mb-4 p-3 rounded-lg bg-[var(--color-bg)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[var(--color-text-dim)] text-sm">Dataset confidence</span>
          <StatusBadge status={confidenceToStatus(dataQuality.confidence)} />
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {dataQuality.validLapCount} valid laps • {dataQuality.optionalMissingChannels.length} optional channels missing
        </p>
      </div>

      {/* Severity summary bar */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-4 mb-4 px-3 py-2.5 rounded-lg bg-[var(--color-bg)]">
          {severityCounts.CRITICAL > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-red)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-red)]" />
              {severityCounts.CRITICAL} Critical
            </span>
          )}
          {severityCounts.WARNING > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-accent)]">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
              {severityCounts.WARNING} Warning
            </span>
          )}
          {severityCounts.INFO > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-green)]">
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
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.category}>
              {/* Collapsible category header */}
              <button
                onClick={() => toggle(group.category)}
                className="w-full flex items-center justify-between mb-2 cursor-pointer bg-transparent border-none p-0 text-left"
              >
                <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span>{CATEGORY_ICONS[group.category]}</span>
                  {group.category}
                  <span className="bg-[var(--color-bg)] rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-dim)] ml-1">
                    {group.items.length}
                  </span>
                </span>
                <svg
                  className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 ${collapsed.has(group.category) ? '-rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Recommendation cards */}
              {!collapsed.has(group.category) && (
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-[var(--color-card-border)] border-l-4 p-3 flex gap-3"
                      style={{ borderLeftColor: severityBorderColor(item.severity) }}
                    >
                      {/* Priority badge */}
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-bg)] flex items-center justify-center">
                        <span className="font-mono text-xs font-bold text-[var(--color-text-dim)]">
                          {item.priority}
                        </span>
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <StatusBadge status={severityToStatus(item.severity)} />
                            <StatusBadge status={confidenceToStatus(item.confidence)} />
                            {item.exactness && <StatusBadge status={exactnessToStatus(item.exactness)} />}
                          </div>
                        </div>
                        <p className="text-sm text-[var(--color-text)] font-medium mb-1.5">{item.action}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mb-2">{item.rationale}</p>
                        {item.exactness && (
                          <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
                            {item.exactness === 'exact' && 'Exact change mapped from parsed setup.'}
                            {item.exactness === 'inferred' && 'Directionally inferred from telemetry because the garage parameter could not be mapped exactly.'}
                            {item.exactness === 'blocked' && 'Constrained by missing setup data or a sim limit; see notes below.'}
                          </p>
                        )}
                        {item.evidence.length > 0 && (
                          <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-0.5">
                            {item.evidence.slice(0, 3).map((ev) => (
                              <li key={ev}>{ev}</li>
                            ))}
                          </ul>
                        )}
                        {item.specifics && item.specifics.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[var(--color-card-border)] space-y-1">
                            {item.specifics.map((s) => (
                              <div key={s.parameter} className="flex items-center gap-2 text-xs">
                                <span className="text-[var(--color-text-muted)] min-w-0 truncate">{s.parameter}:</span>
                                <span className="font-mono text-[var(--color-text-dim)]">{s.current}</span>
                                <span className="text-[var(--color-accent)] font-bold">{'\u2192'}</span>
                                <span className="font-mono font-semibold text-[var(--color-text)]">{s.target}</span>
                                <span className="text-[var(--color-text-muted)]">({s.delta})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {item.verify && item.verify.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[var(--color-card-border)]">
                            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Verify After Change</p>
                            <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-0.5">
                              {item.verify.map((check) => (
                                <li key={check}>{check}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.blockedBy && item.blockedBy.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[var(--color-card-border)]">
                            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Limits</p>
                            <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-0.5">
                              {item.blockedBy.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
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
