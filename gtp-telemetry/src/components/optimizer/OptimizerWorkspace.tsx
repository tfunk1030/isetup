import { lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleDot,
  Cog,
  Gauge,
  GitCompare,
  Radar,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Target,
  Wind,
  Wrench,
} from 'lucide-react';
import { AIRecommendationAssistant } from '../dashboard/AIRecommendationAssistant';
import { Card } from '../shared/Card';
import { MetricRow } from '../shared/MetricRow';
import { StatusBadge } from '../shared/StatusBadge';
import { useSessionStore } from '../../store/session-store';
import type {
  ConfidenceLevel,
  SessionAnalysis,
  SetupParameterGroup,
  SetupRecommendation,
} from '../../lib/types';
import type { EvidencePanelId } from '../../lib/ui-types';

interface OptimizerWorkspaceProps {
  analysis: SessionAnalysis;
}

const LapTimesChart = lazy(() =>
  import('../dashboard/LapTimesChart').then((m) => ({ default: m.LapTimesChart }))
);
const TyreTempsPanel = lazy(() =>
  import('../dashboard/TyreTempsPanel').then((m) => ({ default: m.TyreTempsPanel }))
);
const TyrePressuresChart = lazy(() =>
  import('../dashboard/TyrePressuresChart').then((m) => ({ default: m.TyrePressuresChart }))
);
const TyreWearPanel = lazy(() =>
  import('../dashboard/TyreWearPanel').then((m) => ({ default: m.TyreWearPanel }))
);
const RideHeightScatter = lazy(() =>
  import('../dashboard/RideHeightScatter').then((m) => ({ default: m.RideHeightScatter }))
);
const ShockVelocityPanel = lazy(() =>
  import('../dashboard/ShockVelocityPanel').then((m) => ({ default: m.ShockVelocityPanel }))
);
const SplitterAnalysis = lazy(() =>
  import('../dashboard/SplitterAnalysis').then((m) => ({ default: m.SplitterAnalysis }))
);
const GForceScatter = lazy(() =>
  import('../dashboard/GForceScatter').then((m) => ({ default: m.GForceScatter }))
);
const DriverAidsPanel = lazy(() =>
  import('../dashboard/DriverAidsPanel').then((m) => ({ default: m.DriverAidsPanel }))
);
const FuelPanel = lazy(() =>
  import('../dashboard/FuelPanel').then((m) => ({ default: m.FuelPanel }))
);
const ConditioningTrend = lazy(() =>
  import('../dashboard/ConditioningTrend').then((m) => ({ default: m.ConditioningTrend }))
);
const EngineTempsPanel = lazy(() =>
  import('../dashboard/EngineTempsPanel').then((m) => ({ default: m.EngineTempsPanel }))
);

type GroupMeta = {
  label: string;
  color: string;
  icon: LucideIcon;
};

const GROUP_META: Record<SetupParameterGroup, GroupMeta> = {
  aero: { label: 'Aero', color: 'var(--color-accent)', icon: Wind },
  platform: { label: 'Platform', color: 'var(--color-cyan)', icon: Gauge },
  suspension: { label: 'Suspension', color: 'var(--color-blue)', icon: Cog },
  dampers: { label: 'Dampers', color: 'var(--color-purple)', icon: SlidersHorizontal },
  alignment: { label: 'Alignment', color: 'var(--color-green)', icon: Target },
  brakes: { label: 'Brakes', color: 'var(--color-red)', icon: ShieldAlert },
  diff: { label: 'Differential', color: 'var(--color-accent)', icon: CircleDot },
  tyres: { label: 'Tyres', color: 'var(--color-accent)', icon: CircleDot },
  electronics: { label: 'Electronics', color: 'var(--color-cyan)', icon: Radar },
};

const EVIDENCE_META: Record<EvidencePanelId, { label: string; description: string }> = {
  session: {
    label: 'Session Quality',
    description: 'Lap trend, stint quality, and telemetry capture health.',
  },
  tyres: {
    label: 'Tyres',
    description: 'Temperatures, pressures, wear, and conditioning context.',
  },
  platform: {
    label: 'Platform',
    description: 'Ride heights, bottoming, splitter, and shock velocity evidence.',
  },
  dynamics: {
    label: 'Dynamics',
    description: 'G-force envelope, aids activity, fuel and engine context.',
  },
  context: {
    label: 'Setup Context',
    description: 'Track guidance, car quirks, and parser quality notes.',
  },
};

function confidenceStatus(confidence: ConfidenceLevel): 'OK' | 'HIGH' | 'RISK' {
  if (confidence === 'HIGH') return 'OK';
  if (confidence === 'MEDIUM') return 'HIGH';
  return 'RISK';
}

function evidenceForRecommendation(item: SetupRecommendation): EvidencePanelId {
  if (item.category === 'TYRES') return 'tyres';
  if (item.category === 'PLATFORM' || item.category === 'AERO') return 'platform';
  if (item.category === 'TRACK') return 'context';
  if (item.category === 'BRAKES' || item.category === 'AIDS' || item.category === 'POWERTRAIN' || item.category === 'DYNAMICS') {
    return 'dynamics';
  }
  return 'session';
}

function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

function queueSummary(item: SetupRecommendation): string {
  if (!item.specifics || item.specifics.length === 0) {
    return item.action;
  }

  const [first] = item.specifics;
  const suffix = item.specifics.length > 1 ? ` +${item.specifics.length - 1} more` : '';
  return `${first.parameter}: ${first.current} -> ${first.target}${suffix}`;
}

function sectionLoaderText(panelId: EvidencePanelId): string {
  return `Loading ${EVIDENCE_META[panelId].label.toLowerCase()} evidence...`;
}

function EvidenceSection({
  panelId,
  active,
  onToggle,
  children,
}: {
  panelId: EvidencePanelId;
  active: boolean;
  onToggle: (id: EvidencePanelId) => void;
  children: ReactNode;
}) {
  const meta = EVIDENCE_META[panelId];

  return (
    <section className="rounded-[24px] border border-[var(--color-card-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => onToggle(panelId)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="font-display text-lg font-semibold text-[var(--color-text)]">{meta.label}</span>
          <span className="mt-1 block text-sm text-[var(--color-text-muted)]">{meta.description}</span>
        </span>
        <span className="rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          {active ? 'Hide' : 'Show'}
        </span>
      </button>
      {active && (
        <div className="border-t border-[var(--color-card-border)] px-5 py-5">
          <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">{sectionLoaderText(panelId)}</p>}>
            {children}
          </Suspense>
        </div>
      )}
    </section>
  );
}

export function OptimizerWorkspace({ analysis }: OptimizerWorkspaceProps) {
  const {
    openEvidenceId,
    selectedRecommendationId,
    setAppView,
    setOpenEvidenceId,
    setSelectedRecommendation,
  } = useSessionStore();

  const groupedSetup = useMemo(() => {
    const groups = new Map<SetupParameterGroup, typeof analysis.normalizedSetup.parameters>();
    for (const parameter of analysis.normalizedSetup.parameters) {
      const existing = groups.get(parameter.group) ?? [];
      existing.push(parameter);
      groups.set(parameter.group, existing);
    }
    return [...groups.entries()].sort((left, right) =>
      GROUP_META[left[0]].label.localeCompare(GROUP_META[right[0]].label),
    );
  }, [analysis]);

  const actionableRecommendations = useMemo(
    () => analysis.recommendations.filter((item) => item.id !== 'all-clear'),
    [analysis.recommendations],
  );
  const exactRecommendations = useMemo(
    () =>
      actionableRecommendations.filter(
        (item) => item.exactness === 'exact' || (item.specifics?.length ?? 0) > 0,
      ),
    [actionableRecommendations],
  );
  const supportingRecommendations = useMemo(
    () => actionableRecommendations.filter((item) => !exactRecommendations.includes(item)).slice(0, 6),
    [actionableRecommendations, exactRecommendations],
  );
  const watchSignals = useMemo(
    () => analysis.telemetryReasoning.filter((signal) => signal.direction !== 'stable').slice(0, 5),
    [analysis.telemetryReasoning],
  );
  const selectedRecommendation = useMemo(() => {
    const fallback = exactRecommendations[0] ?? actionableRecommendations[0] ?? null;
    if (!selectedRecommendationId) return fallback;
    return actionableRecommendations.find((item) => item.id === selectedRecommendationId) ?? fallback;
  }, [actionableRecommendations, exactRecommendations, selectedRecommendationId]);

  const mappingStats = analysis.normalizedSetup.mappingStats;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1.2fr)_360px]">
        <div className="space-y-6">
          <Card
            title="Current Setup Browser"
            icon={<Wrench className="h-4 w-4" />}
            subtitle={`${analysis.normalizedSetup.parameters.length} mapped parameters`}
            accent
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="optimizer-stat">
                    <span>Architecture</span>
                    <strong>{analysis.normalizedSetup.architecture.toUpperCase()}</strong>
                  </div>
                  <div className="optimizer-stat">
                    <span>Exact Mapping</span>
                    <strong>{mappingStats.exact}</strong>
                  </div>
                  <div className="optimizer-stat">
                    <span>Ambiguous</span>
                    <strong>{mappingStats.ambiguous}</strong>
                  </div>
                </div>
              </div>

              <div className="max-h-[980px] space-y-3 overflow-y-auto pr-1">
                {groupedSetup.map(([group, parameters]) => {
                  const meta = GROUP_META[group];
                  const Icon = meta.icon;
                  return (
                    <div key={group} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--color-card-border)]"
                            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-display text-sm font-semibold text-[var(--color-text)]">{meta.label}</p>
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                              {parameters.length} parameters
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {parameters.map((parameter) => (
                          <MetricRow
                            key={parameter.parameterKey}
                            label={parameter.displayName}
                            value={parameter.displayValue}
                            unit={parameter.unit}
                            corner={parameter.corner}
                            confidence={parameter.confidence}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Optimizer Queue"
            icon={<Sparkles className="h-4 w-4" />}
            subtitle={`${exactRecommendations.length} exact actions, ${supportingRecommendations.length} supporting calls`}
            accentColor="var(--color-accent)"
          >
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="optimizer-stat">
                  <span>Best Lap</span>
                  <strong>{formatLapTime(analysis.bestTime)}</strong>
                </div>
                <div className="optimizer-stat">
                  <span>Valid Laps</span>
                  <strong>{analysis.validLaps.length}</strong>
                </div>
                <div className="optimizer-stat">
                  <span>Confidence</span>
                  <div className="mt-2">
                    <StatusBadge status={confidenceStatus(analysis.dataQuality.confidence)} />
                  </div>
                </div>
              </div>

              {exactRecommendations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-5">
                  <p className="text-sm text-[var(--color-text)]">No exact setup deltas were mapped from this run.</p>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    Use diagnose mode for directional guidance, or review the supporting recommendations and evidence below.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_320px]">
                  <div className="space-y-3">
                    {exactRecommendations.map((item) => {
                      const isSelected = selectedRecommendation?.id === item.id;
                      const targetEvidence = evidenceForRecommendation(item);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedRecommendation(item.id)}
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_18px_48px_rgba(245,158,11,0.10)]'
                              : 'border-[var(--color-card-border)] bg-[var(--color-surface)] hover:border-[var(--color-card-border-hover)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-[var(--color-bg)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                                  #{item.priority}
                                </span>
                                <StatusBadge status={confidenceStatus(item.confidence)} />
                                <StatusBadge status={item.severity === 'CRITICAL' ? 'HOT' : item.severity === 'WARNING' ? 'HIGH' : 'OK'} />
                              </div>
                              <p className="mt-3 font-display text-lg font-semibold text-[var(--color-text)]">{item.title}</p>
                              <p className="mt-1 text-sm text-[var(--color-accent)]">{queueSummary(item)}</p>
                              <p className="mt-2 text-sm leading-7 text-[var(--color-text-dim)]">{item.rationale}</p>
                            </div>
                            <ArrowRight className={`mt-1 h-4 w-4 flex-shrink-0 ${isSelected ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                            <span>{item.category}</span>
                            <span>{item.exactness ?? 'inferred'}</span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenEvidenceId(openEvidenceId === targetEvidence ? null : targetEvidence);
                              }}
                              className="rounded-full border border-[var(--color-card-border)] bg-[var(--color-bg)] px-2.5 py-1 text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                            >
                              Open {EVIDENCE_META[targetEvidence].label}
                            </button>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-[var(--color-card-border)] bg-[linear-gradient(180deg,rgba(10,16,27,0.98),rgba(7,12,20,0.92))] p-5">
                    {selectedRecommendation ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Selected Action</p>
                          <h3 className="mt-2 font-display text-2xl font-semibold text-[var(--color-text)]">
                            {selectedRecommendation.title}
                          </h3>
                        </div>
                        <div className="space-y-3">
                          {(selectedRecommendation.specifics ?? []).map((specific) => (
                            <div key={specific.parameter} className="optimizer-pair">
                              <span>{specific.parameter}</span>
                              <strong>{specific.current}</strong>
                              <ArrowRight className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                              <strong>{specific.target}</strong>
                              <small>{specific.delta}</small>
                            </div>
                          ))}
                          {(!selectedRecommendation.specifics || selectedRecommendation.specifics.length === 0) && (
                            <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-dim)]">
                              No exact parameter targets were mapped for this recommendation.
                            </div>
                          )}
                        </div>
                        {selectedRecommendation.verify && selectedRecommendation.verify.length > 0 && (
                          <div className="command-note">
                            <strong>Verify after change</strong>
                            <span>{selectedRecommendation.verify.join(' ')}</span>
                          </div>
                        )}
                        {selectedRecommendation.blockedBy && selectedRecommendation.blockedBy.length > 0 && (
                          <div className="command-note">
                            <strong>Constraints</strong>
                            <span>{selectedRecommendation.blockedBy.join(' ')}</span>
                          </div>
                        )}
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Evidence</p>
                          <ul className="mt-2 space-y-2 text-sm text-[var(--color-text-dim)]">
                            {selectedRecommendation.evidence.map((evidence) => (
                              <li key={evidence} className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                                <span>{evidence}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">Select a recommendation to inspect the exact change package.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {supportingRecommendations.length > 0 && (
            <Card
              title="Supporting Recommendations"
              icon={<BarChart3 className="h-4 w-4" />}
              subtitle="Directional calls that support the exact queue"
            >
              <div className="space-y-3">
                {supportingRecommendations.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base font-semibold text-[var(--color-text)]">{item.title}</p>
                      <StatusBadge status={confidenceStatus(item.confidence)} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-text-dim)]">{item.action}</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">{item.rationale}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <AIRecommendationAssistant analysis={analysis} />
        </div>

        <div className="space-y-6">
          <Card
            title="Confidence and Constraints"
            icon={<ShieldAlert className="h-4 w-4" />}
            subtitle="Dataset quality, limits, and watch items"
          >
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-dim)]">Overall confidence</span>
                  <StatusBadge status={confidenceStatus(analysis.dataQuality.confidence)} />
                </div>
                <div className="space-y-2">
                  <MetricRow label="Valid laps" value={analysis.dataQuality.validLapCount} />
                  <MetricRow label="Optional missing" value={analysis.dataQuality.optionalMissingChannels.length} />
                  <MetricRow label="Parser warnings" value={analysis.dataQuality.parserWarnings.length} />
                </div>
              </div>

              <div className="space-y-2">
                {Object.entries(analysis.dataQuality.sectionConfidence).map(([section, confidence]) => (
                  <div key={section} className="flex items-center justify-between rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{section}</span>
                    <StatusBadge status={confidenceStatus(confidence)} />
                  </div>
                ))}
              </div>

              {analysis.constraintViolations.length > 0 && (
                <div className="rounded-2xl border border-[var(--color-red)] bg-[var(--color-red-dim)] p-4">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-red)]">Constraint violations</p>
                  <div className="mt-3 space-y-3">
                    {analysis.constraintViolations.map((item) => (
                      <div key={item.constraintId} className="text-sm text-[var(--color-text)]">
                        <p className="font-semibold">{item.description}</p>
                        <p className="mt-1 text-[13px] text-[var(--color-text-dim)]">{item.workaround}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Watchlist" icon={<AlertTriangle className="h-4 w-4" />} subtitle="Signals worth re-checking after changes">
            <div className="space-y-3">
              {watchSignals.length > 0 ? (
                watchSignals.map((signal) => (
                  <div key={signal.id} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-base font-semibold text-[var(--color-text)]">{signal.summary}</p>
                      <StatusBadge status={confidenceStatus(signal.confidence)} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      {signal.phase} phase • {signal.direction.replace(/-/g, ' ')}
                    </p>
                    {signal.evidence.length > 0 && (
                      <p className="mt-2 text-sm text-[var(--color-text-dim)]">{signal.evidence[0]}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text-muted)]">
                  No risk-biased telemetry reasoning signals were returned for this run.
                </div>
              )}

              {analysis.dataQuality.notes.slice(0, 4).map((note) => (
                <div key={note} className="command-note">
                  <strong>Data note</strong>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Tools" icon={<Radar className="h-4 w-4" />} subtitle="Secondary modules inside the same shell">
            <div className="space-y-3">
              <button type="button" onClick={() => setAppView('compare')} className="tool-launch">
                <span className="tool-launch-icon">
                  <GitCompare className="h-4 w-4" />
                </span>
                <span>
                  <strong>Compare setups</strong>
                  <small>Open the diff tool with this parsed setup available as the baseline.</small>
                </span>
              </button>
              <button type="button" onClick={() => setAppView('diagnose')} className="tool-launch">
                <span className="tool-launch-icon">
                  <Stethoscope className="h-4 w-4" />
                </span>
                <span>
                  <strong>Diagnose symptoms</strong>
                  <small>Translate driver complaints into ranked setup moves with telemetry context.</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpenEvidenceId(openEvidenceId === 'session' ? null : 'session')}
                className="tool-launch"
              >
                <span className="tool-launch-icon">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <span>
                  <strong>Open evidence deck</strong>
                  <small>Expand compact telemetry support without leaving the optimizer.</small>
                </span>
              </button>
            </div>
          </Card>

          <Card title="Context" icon={<Radar className="h-4 w-4" />} subtitle="Track and car knowledge alongside this run">
            <div className="space-y-3 text-sm text-[var(--color-text-dim)]">
              {analysis.trackGuidance && (
                <div className="command-note">
                  <strong>Track focus</strong>
                  <span>{analysis.trackGuidance.keyCompromise ?? analysis.trackGuidance.specialNotes[0]}</span>
                </div>
              )}
              {analysis.carDeepKnowledge && (
                <div className="command-note">
                  <strong>Car note</strong>
                  <span>{analysis.carDeepKnowledge.character}</span>
                </div>
              )}
              {analysis.physicsVersionNote && (
                <div className="command-note">
                  <strong>Physics note</strong>
                  <span>{analysis.physicsVersionNote}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-2xl font-semibold text-[var(--color-text)]">Evidence Deck</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Telemetry modules stay collapsed until a recommendation or review step needs them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(EVIDENCE_META) as EvidencePanelId[]).map((panelId) => (
              <button
                key={panelId}
                type="button"
                onClick={() => setOpenEvidenceId(openEvidenceId === panelId ? null : panelId)}
                className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] transition ${
                  openEvidenceId === panelId
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-card-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {EVIDENCE_META[panelId].label}
              </button>
            ))}
          </div>
        </div>

        <EvidenceSection
          panelId="session"
          active={openEvidenceId === 'session'}
          onToggle={(panelId) => setOpenEvidenceId(openEvidenceId === panelId ? null : panelId)}
        >
          <div className="grid gap-5 xl:grid-cols-2">
            <LapTimesChart analysis={analysis} />
            <ConditioningTrend analysis={analysis} />
          </div>
        </EvidenceSection>

        <EvidenceSection
          panelId="tyres"
          active={openEvidenceId === 'tyres'}
          onToggle={(panelId) => setOpenEvidenceId(openEvidenceId === panelId ? null : panelId)}
        >
          <div className="grid gap-5 xl:grid-cols-3">
            <TyreTempsPanel analysis={analysis} />
            <TyrePressuresChart analysis={analysis} />
            <TyreWearPanel analysis={analysis} />
          </div>
        </EvidenceSection>

        <EvidenceSection
          panelId="platform"
          active={openEvidenceId === 'platform'}
          onToggle={(panelId) => setOpenEvidenceId(openEvidenceId === panelId ? null : panelId)}
        >
          <div className="grid gap-5 xl:grid-cols-2">
            <RideHeightScatter analysis={analysis} />
            <ShockVelocityPanel analysis={analysis} />
            <SplitterAnalysis analysis={analysis} />
          </div>
        </EvidenceSection>

        <EvidenceSection
          panelId="dynamics"
          active={openEvidenceId === 'dynamics'}
          onToggle={(panelId) => setOpenEvidenceId(openEvidenceId === panelId ? null : panelId)}
        >
          <div className="grid gap-5 xl:grid-cols-2">
            <GForceScatter analysis={analysis} />
            <DriverAidsPanel analysis={analysis} />
            <FuelPanel analysis={analysis} />
            <EngineTempsPanel analysis={analysis} />
          </div>
        </EvidenceSection>

        <EvidenceSection
          panelId="context"
          active={openEvidenceId === 'context'}
          onToggle={(panelId) => setOpenEvidenceId(openEvidenceId === panelId ? null : panelId)}
        >
          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="Track Guidance" icon={<Target className="h-4 w-4" />}>
              <div className="space-y-3 text-sm text-[var(--color-text-dim)]">
                {analysis.trackGuidance ? (
                  <>
                    <p>{analysis.trackGuidance.keyCompromise ?? 'Track-specific compromise note unavailable.'}</p>
                    {analysis.trackGuidance.specialNotes.slice(0, 5).map((item) => (
                      <div key={item} className="command-note">
                        <strong>Priority</strong>
                        <span>{item}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p>No track-specific guidance available for this run.</p>
                )}
              </div>
            </Card>
            <Card title="Car Knowledge and Notes" icon={<Radar className="h-4 w-4" />}>
              <div className="space-y-3 text-sm text-[var(--color-text-dim)]">
                {analysis.carDeepKnowledge ? (
                  <>
                    <p>{analysis.carDeepKnowledge.character}</p>
                    {analysis.carDeepKnowledge.weaknesses.slice(0, 5).map((item) => (
                      <div key={item} className="command-note">
                        <strong>Watch</strong>
                        <span>{item}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p>No car-specific deep knowledge note is attached to this session.</p>
                )}
                {analysis.dataQuality.notes.slice(0, 3).map((note) => (
                  <div key={note} className="command-note">
                    <strong>Capture note</strong>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </EvidenceSection>
      </section>
    </div>
  );
}
