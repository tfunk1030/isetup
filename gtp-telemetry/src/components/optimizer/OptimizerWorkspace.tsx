import { lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleDot,
  Cog,
  ChevronDown,
  ChevronUp,
  Gauge,
  History,
  Radar,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  Wind,
  Wrench,
} from 'lucide-react';
import { SessionComparePanel } from './SessionComparePanel';
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
import type { EvidencePanelId, WorkspaceTab } from '../../lib/ui-types';

interface OptimizerWorkspaceProps {
  analysis: SessionAnalysis;
}

/* ── Lazy chart imports ── */
const LapTimesChart = lazy(() => import('../dashboard/LapTimesChart').then((m) => ({ default: m.LapTimesChart })));
const TyreTempsPanel = lazy(() => import('../dashboard/TyreTempsPanel').then((m) => ({ default: m.TyreTempsPanel })));
const TyrePressuresChart = lazy(() => import('../dashboard/TyrePressuresChart').then((m) => ({ default: m.TyrePressuresChart })));
const TyreWearPanel = lazy(() => import('../dashboard/TyreWearPanel').then((m) => ({ default: m.TyreWearPanel })));
const RideHeightScatter = lazy(() => import('../dashboard/RideHeightScatter').then((m) => ({ default: m.RideHeightScatter })));
const ShockVelocityPanel = lazy(() => import('../dashboard/ShockVelocityPanel').then((m) => ({ default: m.ShockVelocityPanel })));
const SplitterAnalysis = lazy(() => import('../dashboard/SplitterAnalysis').then((m) => ({ default: m.SplitterAnalysis })));
const GForceScatter = lazy(() => import('../dashboard/GForceScatter').then((m) => ({ default: m.GForceScatter })));
const DriverAidsPanel = lazy(() => import('../dashboard/DriverAidsPanel').then((m) => ({ default: m.DriverAidsPanel })));
const FuelPanel = lazy(() => import('../dashboard/FuelPanel').then((m) => ({ default: m.FuelPanel })));
const ConditioningTrend = lazy(() => import('../dashboard/ConditioningTrend').then((m) => ({ default: m.ConditioningTrend })));
const EngineTempsPanel = lazy(() => import('../dashboard/EngineTempsPanel').then((m) => ({ default: m.EngineTempsPanel })));

/* ── Constants ── */
type GroupMeta = { label: string; color: string; icon: LucideIcon };

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
  session: { label: 'Session Quality', description: 'Lap trend, stint quality, and telemetry capture health.' },
  tyres: { label: 'Tyres', description: 'Temperatures, pressures, wear, and conditioning context.' },
  platform: { label: 'Platform', description: 'Ride heights, bottoming, splitter, and shock velocity evidence.' },
  dynamics: { label: 'Dynamics', description: 'G-force envelope, aids activity, fuel and engine context.' },
  context: { label: 'Setup Context', description: 'Track guidance, car quirks, and parser quality notes.' },
};

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
  { id: 'queue', label: 'Queue', icon: Sparkles },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'setup', label: 'Setup', icon: Wrench },
  { id: 'evidence', label: 'Evidence', icon: BarChart3 },
  { id: 'context', label: 'Context', icon: Radar },
];

/* ── Helpers ── */
function confidenceStatus(confidence: ConfidenceLevel): 'OK' | 'HIGH' | 'RISK' {
  if (confidence === 'HIGH') return 'OK';
  if (confidence === 'MEDIUM') return 'HIGH';
  return 'RISK';
}

function evidenceForRecommendation(item: SetupRecommendation): EvidencePanelId {
  if (item.category === 'TYRES') return 'tyres';
  if (item.category === 'PLATFORM' || item.category === 'AERO') return 'platform';
  if (item.category === 'TRACK') return 'context';
  if (item.category === 'BRAKES' || item.category === 'AIDS' || item.category === 'POWERTRAIN' || item.category === 'DYNAMICS') return 'dynamics';
  return 'session';
}

function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

function queueSummary(item: SetupRecommendation): string {
  if (!item.specifics || item.specifics.length === 0) return item.action;
  const [first] = item.specifics;
  const suffix = item.specifics.length > 1 ? ` +${item.specifics.length - 1} more` : '';
  return `${first.parameter}: ${first.current} -> ${first.target}${suffix}`;
}

/* ── Evidence Section (multi-open) ── */
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
    <section className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => onToggle(panelId)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span>
          <span className="font-display text-base font-semibold text-[var(--color-text)]">{meta.label}</span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{meta.description}</span>
        </span>
        {active ? <ChevronUp className="h-4 w-4 text-[var(--color-text-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />}
      </button>
      {active && (
        <div className="border-t border-[var(--color-card-border)] px-5 py-5">
          <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">Loading {meta.label.toLowerCase()} evidence...</p>}>
            {children}
          </Suspense>
        </div>
      )}
    </section>
  );
}

/* ── Main component ── */
export function OptimizerWorkspace({ analysis }: OptimizerWorkspaceProps) {
  const {
    openEvidenceIds,
    selectedRecommendationId,
    workspaceTab,
    setWorkspaceTab,
    toggleEvidencePanel,
    collapseAllEvidence,
    setSelectedRecommendation,
    sessionComparison,
    sessionHistory,
    sessionCount,
  } = useSessionStore();

  /* ── Derived data ── */
  const groupedSetup = useMemo(() => {
    const groups = new Map<SetupParameterGroup, typeof analysis.normalizedSetup.parameters>();
    for (const parameter of analysis.normalizedSetup.parameters) {
      const existing = groups.get(parameter.group) ?? [];
      existing.push(parameter);
      groups.set(parameter.group, existing);
    }
    return [...groups.entries()].sort((a, b) => GROUP_META[a[0]].label.localeCompare(GROUP_META[b[0]].label));
  }, [analysis]);

  const actionableRecommendations = useMemo(
    () => analysis.recommendations.filter((item) => item.id !== 'all-clear'),
    [analysis.recommendations],
  );
  const exactRecommendations = useMemo(
    () => actionableRecommendations.filter((item) => item.exactness === 'exact' || (item.specifics?.length ?? 0) > 0),
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
    <div className="space-y-6">
      {/* ── Summary strip ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card)] px-5 py-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={confidenceStatus(analysis.dataQuality.confidence)} />
          <span className="text-xs text-[var(--color-text-muted)]">confidence</span>
        </div>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{formatLapTime(analysis.bestTime)}</strong> best
        </span>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{analysis.validLaps.length}</strong> valid laps
        </span>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{exactRecommendations.length}</strong> exact / <strong className="text-[var(--color-text)]">{actionableRecommendations.length}</strong> total changes
        </span>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-1">
        {WORKSPACE_TABS.map(({ id, label, icon: Icon }) => {
          const active = workspaceTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setWorkspaceTab(id)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold tracking-wide transition ${
                active
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] shadow-sm'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {id === 'queue' && exactRecommendations.length > 0 && (
                <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-bold text-black">
                  {exactRecommendations.length}
                </span>
              )}
              {id === 'sessions' && sessionCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  sessionComparison
                    ? 'bg-[var(--color-green)] text-black'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                }`}>
                  {sessionCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {workspaceTab === 'queue' && (
        <QueueTab
          analysis={analysis}
          exactRecommendations={exactRecommendations}
          supportingRecommendations={supportingRecommendations}
          selectedRecommendation={selectedRecommendation}
          setSelectedRecommendation={setSelectedRecommendation}
          toggleEvidencePanel={toggleEvidencePanel}
          setWorkspaceTab={setWorkspaceTab}
        />
      )}

      {workspaceTab === 'sessions' && (
        <SessionComparePanel
          comparison={sessionComparison}
          sessionHistory={sessionHistory}
          sessionCount={sessionCount}
        />
      )}

      {workspaceTab === 'setup' && (
        <SetupTab
          analysis={analysis}
          groupedSetup={groupedSetup}
          mappingStats={mappingStats}
        />
      )}

      {workspaceTab === 'evidence' && (
        <EvidenceTab
          analysis={analysis}
          openEvidenceIds={openEvidenceIds}
          toggleEvidencePanel={toggleEvidencePanel}
          collapseAllEvidence={collapseAllEvidence}
        />
      )}

      {workspaceTab === 'context' && (
        <ContextTab
          analysis={analysis}
          watchSignals={watchSignals}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TAB: Queue
   ══════════════════════════════════════════════════════ */
function QueueTab({
  analysis,
  exactRecommendations,
  supportingRecommendations,
  selectedRecommendation,
  setSelectedRecommendation,
  toggleEvidencePanel,
  setWorkspaceTab,
}: {
  analysis: SessionAnalysis;
  exactRecommendations: SetupRecommendation[];
  supportingRecommendations: SetupRecommendation[];
  selectedRecommendation: SetupRecommendation | null;
  setSelectedRecommendation: (id: string | null) => void;
  toggleEvidencePanel: (id: EvidencePanelId) => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="space-y-6">
      {exactRecommendations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-6 text-center">
          <p className="text-sm text-[var(--color-text)]">No exact setup deltas were mapped from this run.</p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Check the <button type="button" onClick={() => setWorkspaceTab('evidence')} className="text-[var(--color-accent)] underline">evidence deck</button> or use diagnose mode for directional guidance.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          {/* Recommendation list */}
          <div className="space-y-3">
            {exactRecommendations.map((item) => {
              const isSelected = selectedRecommendation?.id === item.id;
              const targetEvidence = evidenceForRecommendation(item);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRecommendation(item.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRecommendation(item.id); } }}
                  className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_12px_36px_rgba(245,158,11,0.08)]'
                      : 'border-[var(--color-card-border)] bg-[var(--color-surface)] hover:border-[var(--color-card-border-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                          #{item.priority}
                        </span>
                        <StatusBadge status={confidenceStatus(item.confidence)} />
                        <StatusBadge status={item.severity === 'CRITICAL' ? 'HOT' : item.severity === 'WARNING' ? 'HIGH' : 'OK'} />
                      </div>
                      <p className="mt-2 font-display text-base font-semibold text-[var(--color-text)]">{item.title}</p>
                      <p className="mt-1 text-sm text-[var(--color-accent)]">{queueSummary(item)}</p>
                    </div>
                    <ArrowRight className={`mt-1 h-4 w-4 flex-shrink-0 ${isSelected ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                    <span>{item.category}</span>
                    <span>{item.exactness ?? 'inferred'}</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleEvidencePanel(targetEvidence);
                        setWorkspaceTab('evidence');
                      }}
                      className="rounded-full border border-[var(--color-card-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                    >
                      {EVIDENCE_META[targetEvidence].label}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected recommendation detail */}
          <div className="rounded-2xl border border-[var(--color-card-border)] bg-[linear-gradient(180deg,rgba(10,16,27,0.98),rgba(7,12,20,0.92))] p-5">
            {selectedRecommendation ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Selected Action</p>
                  <h3 className="mt-1.5 font-display text-xl font-semibold text-[var(--color-text)]">{selectedRecommendation.title}</h3>
                </div>
                <div className="space-y-2.5">
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
                    <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-dim)]">
                      No exact parameter targets mapped.
                    </div>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-[var(--color-text-dim)]">{selectedRecommendation.rationale}</p>
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
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Evidence</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-[var(--color-text-dim)]">
                    {selectedRecommendation.evidence.map((e) => (
                      <li key={e} className="flex items-start gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">Select a recommendation to see its change package.</p>
            )}
          </div>
        </div>
      )}

      {/* Supporting recommendations */}
      {supportingRecommendations.length > 0 && (
        <Card title="Supporting Recommendations" icon={<BarChart3 className="h-4 w-4" />} subtitle="Directional calls that support the exact queue">
          <div className="space-y-3">
            {supportingRecommendations.map((item) => (
              <div key={item.id} className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                  <StatusBadge status={confidenceStatus(item.confidence)} />
                </div>
                <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">{item.action}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* AI assistant */}
      <AIRecommendationAssistant analysis={analysis} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TAB: Setup Browser
   ══════════════════════════════════════════════════════ */
function SetupTab({
  analysis,
  groupedSetup,
  mappingStats,
}: {
  analysis: SessionAnalysis;
  groupedSetup: [SetupParameterGroup, typeof analysis.normalizedSetup.parameters][];
  mappingStats: { exact: number; ambiguous: number };
}) {
  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-card)] px-5 py-3">
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{analysis.normalizedSetup.parameters.length}</strong> mapped parameters
        </span>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          Architecture: <strong className="text-[var(--color-text)]">{analysis.normalizedSetup.architecture.toUpperCase()}</strong>
        </span>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{mappingStats.exact}</strong> exact / <strong className="text-[var(--color-text)]">{mappingStats.ambiguous}</strong> ambiguous
        </span>
      </div>

      {/* Parameter groups — 2 columns on xl */}
      <div className="grid gap-4 xl:grid-cols-2">
        {groupedSetup.map(([group, parameters]) => {
          const meta = GROUP_META[group];
          const Icon = meta.icon;
          return (
            <div key={group} className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-card-border)]"
                  style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p className="font-display text-sm font-semibold text-[var(--color-text)]">{meta.label}</p>
                <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">{parameters.length}</span>
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
  );
}

/* ══════════════════════════════════════════════════════
   TAB: Evidence
   ══════════════════════════════════════════════════════ */
function EvidenceTab({
  analysis,
  openEvidenceIds,
  toggleEvidencePanel,
  collapseAllEvidence,
}: {
  analysis: SessionAnalysis;
  openEvidenceIds: Set<EvidencePanelId>;
  toggleEvidencePanel: (id: EvidencePanelId) => void;
  collapseAllEvidence: () => void;
}) {
  const anyOpen = openEvidenceIds.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-muted)]">
          Open multiple panels to compare across categories.
        </p>
        {anyOpen && (
          <button
            type="button"
            onClick={collapseAllEvidence}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
          >
            Collapse all
          </button>
        )}
      </div>

      <EvidenceSection panelId="session" active={openEvidenceIds.has('session')} onToggle={toggleEvidencePanel}>
        <div className="grid gap-5 xl:grid-cols-2">
          <LapTimesChart analysis={analysis} />
          <ConditioningTrend analysis={analysis} />
        </div>
      </EvidenceSection>

      <EvidenceSection panelId="tyres" active={openEvidenceIds.has('tyres')} onToggle={toggleEvidencePanel}>
        <div className="grid gap-5 xl:grid-cols-3">
          <TyreTempsPanel analysis={analysis} />
          <TyrePressuresChart analysis={analysis} />
          <TyreWearPanel analysis={analysis} />
        </div>
      </EvidenceSection>

      <EvidenceSection panelId="platform" active={openEvidenceIds.has('platform')} onToggle={toggleEvidencePanel}>
        <div className="grid gap-5 xl:grid-cols-2">
          <RideHeightScatter analysis={analysis} />
          <ShockVelocityPanel analysis={analysis} />
          <SplitterAnalysis analysis={analysis} />
        </div>
      </EvidenceSection>

      <EvidenceSection panelId="dynamics" active={openEvidenceIds.has('dynamics')} onToggle={toggleEvidencePanel}>
        <div className="grid gap-5 xl:grid-cols-2">
          <GForceScatter analysis={analysis} />
          <DriverAidsPanel analysis={analysis} />
          <FuelPanel analysis={analysis} />
          <EngineTempsPanel analysis={analysis} />
        </div>
      </EvidenceSection>

      <EvidenceSection panelId="context" active={openEvidenceIds.has('context')} onToggle={toggleEvidencePanel}>
        <div className="grid gap-5 xl:grid-cols-2">
          <Card title="Track Guidance" icon={<Target className="h-4 w-4" />}>
            <div className="space-y-3 text-sm text-[var(--color-text-dim)]">
              {analysis.trackGuidance ? (
                <>
                  <p>{analysis.trackGuidance.keyCompromise ?? 'Track-specific compromise note unavailable.'}</p>
                  {analysis.trackGuidance.specialNotes.slice(0, 5).map((item) => (
                    <div key={item} className="command-note"><strong>Priority</strong><span>{item}</span></div>
                  ))}
                </>
              ) : (
                <p>No track-specific guidance available for this run.</p>
              )}
            </div>
          </Card>
          <Card title="Car Knowledge" icon={<Radar className="h-4 w-4" />}>
            <div className="space-y-3 text-sm text-[var(--color-text-dim)]">
              {analysis.carDeepKnowledge ? (
                <>
                  <p>{analysis.carDeepKnowledge.character}</p>
                  {analysis.carDeepKnowledge.weaknesses.slice(0, 5).map((item) => (
                    <div key={item} className="command-note"><strong>Watch</strong><span>{item}</span></div>
                  ))}
                </>
              ) : (
                <p>No car-specific deep knowledge for this session.</p>
              )}
            </div>
          </Card>
        </div>
      </EvidenceSection>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   TAB: Context (Confidence + Watchlist + Notes)
   ══════════════════════════════════════════════════════ */
function ContextTab({
  analysis,
  watchSignals,
}: {
  analysis: SessionAnalysis;
  watchSignals: SessionAnalysis['telemetryReasoning'];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {/* Confidence & Constraints */}
      <Card title="Confidence & Constraints" icon={<ShieldAlert className="h-4 w-4" />} subtitle="Dataset quality and limits">
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
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

          <div className="space-y-1.5">
            {Object.entries(analysis.dataQuality.sectionConfidence).map(([section, confidence]) => (
              <div key={section} className="flex items-center justify-between rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-2">
                <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{section}</span>
                <StatusBadge status={confidenceStatus(confidence)} />
              </div>
            ))}
          </div>

          {analysis.constraintViolations.length > 0 && (
            <div className="rounded-xl border border-[var(--color-red)] bg-[var(--color-red-dim)] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-red)]">Constraint violations</p>
              <div className="mt-3 space-y-2">
                {analysis.constraintViolations.map((item) => (
                  <div key={item.constraintId} className="text-sm text-[var(--color-text)]">
                    <p className="font-semibold">{item.description}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{item.workaround}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Watchlist */}
      <Card title="Watchlist" icon={<AlertTriangle className="h-4 w-4" />} subtitle="Signals worth re-checking after changes">
        <div className="space-y-3">
          {watchSignals.length > 0 ? (
            watchSignals.map((signal) => (
              <div key={signal.id} className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-sm font-semibold text-[var(--color-text)]">{signal.summary}</p>
                  <StatusBadge status={confidenceStatus(signal.confidence)} />
                </div>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                  {signal.phase} phase &middot; {signal.direction.replace(/-/g, ' ')}
                </p>
                {signal.evidence.length > 0 && (
                  <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">{signal.evidence[0]}</p>
                )}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text-muted)]">
              No risk-biased telemetry reasoning signals for this run.
            </div>
          )}

          {analysis.dataQuality.notes.slice(0, 4).map((note) => (
            <div key={note} className="command-note"><strong>Data note</strong><span>{note}</span></div>
          ))}
        </div>
      </Card>

      {/* Session context notes */}
      <Card title="Session Context" icon={<Radar className="h-4 w-4" />} subtitle="Track, car, and physics notes" span={2}>
        <div className="grid gap-3 xl:grid-cols-3">
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
              <strong>Physics</strong>
              <span>{analysis.physicsVersionNote}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
