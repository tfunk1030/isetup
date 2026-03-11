import { lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
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
import { useSessionStore } from '../../store/session-store';
import type {
  SessionAnalysis,
  SetupParameterGroup,
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
function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
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
    workspaceTab,
    setWorkspaceTab,
    toggleEvidencePanel,
    collapseAllEvidence,
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

  const mappingStats = analysis.normalizedSetup.mappingStats;

  return (
    <div className="space-y-6">
      {/* ── Summary strip ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card)] px-5 py-3">
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{formatLapTime(analysis.bestTime)}</strong> best
        </span>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{analysis.dataInventory.validLapCount}</strong> / {analysis.dataInventory.totalLapCount} valid laps
        </span>
        <span className="text-[var(--color-card-border)]">&middot;</span>
        <span className="text-xs text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{analysis.dataInventory.channelsPresent.length}</strong> channels present
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
  setWorkspaceTab,
}: {
  analysis: SessionAnalysis;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-6 text-center">
        <p className="text-sm text-[var(--color-text)]">Setup recommendations are now provided by the AI assistant below.</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Check the <button type="button" onClick={() => setWorkspaceTab('evidence')} className="text-[var(--color-accent)] underline">evidence deck</button> for telemetry data, or use diagnose mode for directional guidance.
        </p>
      </div>

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
}: {
  analysis: SessionAnalysis;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {/* Data Inventory & Constraints */}
      <Card title="Data Inventory & Constraints" icon={<ShieldAlert className="h-4 w-4" />} subtitle="Dataset contents and limits">
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
            <div className="space-y-2">
              <MetricRow label="Valid laps" value={analysis.dataInventory.validLapCount} />
              <MetricRow label="Total laps" value={analysis.dataInventory.totalLapCount} />
              <MetricRow label="Channels present" value={analysis.dataInventory.channelsPresent.length} />
              <MetricRow label="Channels missing" value={analysis.dataInventory.channelsMissing.length} />
              <MetricRow label="Parser warnings" value={analysis.dataInventory.parserWarnings.length} />
            </div>
          </div>

          {analysis.dataInventory.parserWarnings.length > 0 && (
            <div className="space-y-1.5">
              {analysis.dataInventory.parserWarnings.slice(0, 4).map((warning) => (
                <div key={warning} className="command-note"><strong>Warning</strong><span>{warning}</span></div>
              ))}
            </div>
          )}

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

      {/* Missing channels detail */}
      <Card title="Channel Coverage" icon={<AlertTriangle className="h-4 w-4" />} subtitle="Available and missing telemetry channels">
        <div className="space-y-3">
          {analysis.dataInventory.channelsMissing.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Missing channels</p>
              {analysis.dataInventory.channelsMissing.slice(0, 8).map((ch) => (
                <div key={ch} className="command-note"><strong>Missing</strong><span>{ch}</span></div>
              ))}
              {analysis.dataInventory.channelsMissing.length > 8 && (
                <p className="text-xs text-[var(--color-text-muted)]">+{analysis.dataInventory.channelsMissing.length - 8} more</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text-muted)]">
              All expected channels are present in this dataset.
            </div>
          )}
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
