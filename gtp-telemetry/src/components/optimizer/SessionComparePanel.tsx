import { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Equal,
  GitCompare,
  History,
  Minus,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Card } from '../shared/Card';
import type { SessionComparisonResult, DeltaVerdict, MetricDelta } from '../../lib/session-comparison';
import type { SessionRecord, RecommendationOutcome } from '../../lib/session-memory';

// ── Verdict styling ──────────────────────────────────────────

function verdictColor(verdict: DeltaVerdict): string {
  switch (verdict) {
    case 'better': return 'var(--color-green)';
    case 'worse': return 'var(--color-red)';
    case 'same': return 'var(--color-text-muted)';
    default: return 'var(--color-text-muted)';
  }
}

function verdictBg(verdict: DeltaVerdict): string {
  switch (verdict) {
    case 'better': return 'var(--color-green-dim)';
    case 'worse': return 'var(--color-red-dim)';
    default: return 'var(--color-surface)';
  }
}

function VerdictIcon({ verdict, size = 16 }: { verdict: DeltaVerdict; size?: number }) {
  const color = verdictColor(verdict);
  switch (verdict) {
    case 'better': return <TrendingUp style={{ color }} size={size} />;
    case 'worse': return <TrendingDown style={{ color }} size={size} />;
    case 'same': return <Equal style={{ color }} size={size} />;
    default: return <Minus style={{ color }} size={size} />;
  }
}

function VerdictBadge({ verdict }: { verdict: DeltaVerdict }) {
  const labels: Record<DeltaVerdict, string> = {
    better: 'IMPROVED',
    worse: 'REGRESSED',
    same: 'NEUTRAL',
    inconclusive: 'N/A',
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ color: verdictColor(verdict), background: verdictBg(verdict) }}
    >
      <VerdictIcon verdict={verdict} size={12} />
      {labels[verdict]}
    </span>
  );
}

// ── Timestamp formatting ─────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 2) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Metric Delta Row ─────────────────────────────────────────

function MetricDeltaRow({ metric }: { metric: MetricDelta }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <VerdictIcon verdict={metric.verdict} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-text)]">{metric.label}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{metric.group}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div className="hidden sm:block">
          <p className="text-xs text-[var(--color-text-muted)]">{metric.valuePrev}</p>
        </div>
        <ArrowRight className="h-3 w-3 text-[var(--color-text-muted)] hidden sm:block" />
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{metric.valueCurr}</p>
        </div>
        <span
          className="min-w-[72px] rounded-lg px-2 py-1 text-center text-xs font-bold"
          style={{ color: verdictColor(metric.verdict), background: verdictBg(metric.verdict) }}
        >
          {metric.delta}
        </span>
      </div>
    </div>
  );
}

// ── Recommendation Outcome Row ───────────────────────────────

function OutcomeRow({ outcome }: { outcome: RecommendationOutcome }) {
  const verdictMap: Record<string, DeltaVerdict> = {
    helped: 'better',
    hurt: 'worse',
    neutral: 'same',
    inconclusive: 'inconclusive',
  };
  const verdict = verdictMap[outcome.verdict] ?? 'inconclusive';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="mt-0.5">
        {outcome.wasApplied ? (
          <CheckCircle2 size={16} style={{ color: verdictColor(verdict) }} />
        ) : (
          <XCircle size={16} className="text-[var(--color-text-muted)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--color-text)]">{outcome.displayName}</p>
          <VerdictBadge verdict={verdict} />
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          {outcome.wasApplied ? outcome.evidence : 'Not applied — no data to validate.'}
        </p>
      </div>
    </div>
  );
}

// ── Session History Row ──────────────────────────────────────

function HistoryRow({ record, index }: { record: SessionRecord; index: number }) {
  const bestLap = Number.isFinite(record.metrics.bestLapTime)
    ? `${Math.floor(record.metrics.bestLapTime / 60)}:${(record.metrics.bestLapTime % 60).toFixed(3).padStart(6, '0')}`
    : '--';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface)] px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-card-border)] bg-[var(--color-bg)] text-[10px] font-bold text-[var(--color-text-muted)]">
          {index + 1}
        </span>
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{bestLap}</p>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            {record.validLaps} laps &middot; {formatTimestamp(record.timestamp)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {record.improvementScore !== null && (
          <VerdictBadge
            verdict={record.improvementScore > 0.15 ? 'better' : record.improvementScore < -0.15 ? 'worse' : 'same'}
          />
        )}
        {record.metrics.cleanBottoming > 5 && (
          <span className="text-[10px] text-[var(--color-red)]">{record.metrics.cleanBottoming} btm</span>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────

interface SessionComparePanelProps {
  comparison: SessionComparisonResult | null;
  sessionHistory: SessionRecord[];
  sessionCount: number;
}

export function SessionComparePanel({
  comparison,
  sessionHistory,
  sessionCount,
}: SessionComparePanelProps) {
  // Group deltas by category
  const groupedDeltas = useMemo(() => {
    if (!comparison) return [];
    const groups = new Map<string, MetricDelta[]>();
    for (const delta of comparison.deltas) {
      const existing = groups.get(delta.group) ?? [];
      existing.push(delta);
      groups.set(delta.group, existing);
    }
    return [...groups.entries()];
  }, [comparison]);

  const appliedOutcomes = useMemo(
    () => comparison?.outcomes.filter(o => o.wasApplied) ?? [],
    [comparison],
  );
  const skippedOutcomes = useMemo(
    () => comparison?.outcomes.filter(o => !o.wasApplied) ?? [],
    [comparison],
  );

  // No comparison available — show history or first-session message
  if (!comparison) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-6 text-center">
          <History className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" />
          <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">
            {sessionCount === 1 ? 'First session recorded' : 'No comparison available'}
          </p>
          <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
            {sessionCount === 1
              ? 'Go do more laps and import another IBT — the system will automatically compare sessions and tell you what got better or worse.'
              : 'Import an IBT file for the same car + track combination to see session-over-session comparison.'}
          </p>
        </div>

        {sessionHistory.length > 0 && (
          <Card
            title="Session History"
            icon={<History className="h-4 w-4" />}
            subtitle={`${sessionHistory.length} session${sessionHistory.length > 1 ? 's' : ''} recorded`}
          >
            <div className="space-y-2">
              {sessionHistory.slice().reverse().map((record, i) => (
                <HistoryRow key={record.id} record={record} index={sessionHistory.length - 1 - i} />
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // Full comparison view
  return (
    <div className="space-y-5">
      {/* ── Overall verdict banner ── */}
      <div
        className="rounded-2xl border p-5"
        style={{
          borderColor: verdictColor(comparison.overallVerdict),
          background: verdictBg(comparison.overallVerdict),
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: verdictColor(comparison.overallVerdict) + '22' }}
          >
            <VerdictIcon verdict={comparison.overallVerdict} size={24} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg font-bold text-[var(--color-text)]">
                Session Comparison
              </h2>
              <VerdictBadge verdict={comparison.overallVerdict} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-dim)]">{comparison.summary}</p>
          </div>
        </div>

        {/* Session metadata row */}
        <div className="mt-4 flex flex-wrap items-center gap-6 border-t pt-3" style={{ borderColor: verdictColor(comparison.overallVerdict) + '33' }}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Previous</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {comparison.prevSession.bestLap}
              <span className="ml-1.5 text-xs font-normal text-[var(--color-text-muted)]">
                ({comparison.prevSession.validLaps} laps)
              </span>
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {formatTimestamp(comparison.prevSession.timestamp)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Current</p>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {comparison.currSession.bestLap}
              <span className="ml-1.5 text-xs font-normal text-[var(--color-text-muted)]">
                ({comparison.currSession.validLaps} laps)
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Metric deltas by group ── */}
      {groupedDeltas.map(([group, deltas]) => (
        <div key={group}>
          <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{group}</p>
          <div className="space-y-2">
            {deltas.map(delta => (
              <MetricDeltaRow key={delta.label} metric={delta} />
            ))}
          </div>
        </div>
      ))}

      {/* ── Setup changes between sessions ── */}
      {comparison.setupDiff && comparison.setupDiff.diffs.length > 0 && (
        <Card
          title="Setup Changes"
          icon={<GitCompare className="h-4 w-4" />}
          subtitle={comparison.setupDiff.summary}
        >
          <div className="space-y-2">
            {comparison.setupDiff.diffs.slice(0, 15).map(diff => (
              <div
                key={diff.parameterKey}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface)] px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[var(--color-text)]">{diff.displayName}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{diff.group}</p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="text-xs text-[var(--color-text-muted)]">{diff.setupB.value}</span>
                  <ArrowRight className="h-3 w-3 text-[var(--color-accent)]" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">{diff.setupA.value}</span>
                  <span
                    className="rounded-lg px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      color: diff.impactMagnitude === 'large' ? 'var(--color-accent)' : 'var(--color-text-dim)',
                      background: diff.impactMagnitude === 'large' ? 'var(--color-accent-soft)' : 'var(--color-bg-subtle)',
                    }}
                  >
                    {diff.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Recommendation outcomes ── */}
      {appliedOutcomes.length > 0 && (
        <Card
          title="Recommendation Outcomes"
          icon={<CheckCircle2 className="h-4 w-4" />}
          subtitle={`${appliedOutcomes.filter(o => o.verdict === 'helped').length} helped, ${appliedOutcomes.filter(o => o.verdict === 'hurt').length} hurt`}
        >
          <div className="space-y-2">
            {appliedOutcomes.map(outcome => (
              <OutcomeRow key={outcome.parameterKey} outcome={outcome} />
            ))}
          </div>
        </Card>
      )}

      {skippedOutcomes.length > 0 && (
        <Card
          title="Recommendations Not Applied"
          icon={<XCircle className="h-4 w-4" />}
          subtitle={`${skippedOutcomes.length} recommendation${skippedOutcomes.length > 1 ? 's' : ''} skipped`}
        >
          <div className="space-y-2">
            {skippedOutcomes.slice(0, 5).map(outcome => (
              <OutcomeRow key={outcome.parameterKey} outcome={outcome} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Session History ── */}
      {sessionHistory.length > 1 && (
        <Card
          title="Session History"
          icon={<History className="h-4 w-4" />}
          subtitle={`${sessionHistory.length} sessions at ${comparison.currSession.car} / ${comparison.currSession.track}`}
        >
          <div className="space-y-2">
            {sessionHistory.slice().reverse().slice(0, 10).map((record, i) => (
              <HistoryRow key={record.id} record={record} index={sessionHistory.length - 1 - i} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
