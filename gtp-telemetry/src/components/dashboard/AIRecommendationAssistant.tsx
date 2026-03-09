import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import { generateAISetupBrief, hasAIRecommendationConfig } from '../../lib/ai-recommendations';
import type { AISetupBrief, SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

function BriefSection({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--color-card-border)] bg-[var(--color-bg)] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{icon}</span>
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 mb-4">
      <div className="p-3 rounded-lg bg-[var(--color-bg)] animate-pulse">
        <div className="h-4 bg-[var(--color-card-border)] rounded w-3/4 mb-2" />
        <div className="h-3 bg-[var(--color-card-border)] rounded w-1/2" />
      </div>
      <div className="animate-pulse">
        <div className="h-3 bg-[var(--color-card-border)] rounded w-28 mb-2" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-[var(--color-card-border)]" />
              <div className="h-3 bg-[var(--color-card-border)] rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
      <div className="animate-pulse">
        <div className="h-3 bg-[var(--color-card-border)] rounded w-24 mb-2" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-3 bg-[var(--color-card-border)] rounded" style={{ width: `${50 + i * 15}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function sourceLabel(source: AISetupBrief['source']): { icon: string; label: string } {
  if (source === 'consensus') return { icon: '\u2728', label: 'Consensus' };
  if (source === 'single-model') return { icon: '\u{1F916}', label: 'Single Model' };
  return { icon: '\u2699\uFE0F', label: 'Rule Engine' };
}

export function AIRecommendationAssistant({ analysis }: Props) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<AISetupBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBrief(null);
    setError(null);
  }, [analysis.header.car, analysis.header.track, analysis.bestTime]);

  const configured = hasAIRecommendationConfig();

  const runAssistant = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateAISetupBrief(analysis);
      setBrief(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const src = brief ? sourceLabel(brief.source) : null;

  return (
    <Card title="AI Setup Assistant" icon={'\u{1F916}'}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          Synthesizes your telemetry + rule-engine outputs into a concise action brief.
        </p>
        <StatusBadge status={configured ? 'OK' : 'HIGH'} />
      </div>

      <button
        onClick={runAssistant}
        disabled={loading}
        className="bg-[var(--color-accent)] text-black border-none px-4 py-2 rounded-md cursor-pointer text-[13px] font-semibold mb-4 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating...' : configured ? 'Generate Dual-Model Brief' : 'Generate Local Brief'}
      </button>

      {!configured && (
        <p className="text-xs text-[var(--color-text-muted)] mb-3">
          Configure `VITE_OPENAI_API_KEY` to enable cloud AI synthesis. Using local rule-engine fallback otherwise.
        </p>
      )}

      {loading && <LoadingSkeleton />}

      {/* Error state with retry */}
      {error && (
        <div
          className="flex items-start gap-3 p-3 rounded-lg border mb-3"
          style={{ borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}
        >
          <span className="text-base mt-0.5">{'\u26A0\uFE0F'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--color-red)] mb-1">Generation failed</p>
            <p className="text-xs text-[var(--color-text-muted)] mb-2">{error}</p>
            <button
              onClick={runAssistant}
              disabled={loading}
              className="text-xs font-semibold text-[var(--color-accent)] bg-transparent border-none cursor-pointer hover:underline p-0 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {brief && (
        <div className="space-y-3 text-sm animate-fade-slide-in">
          {/* Summary section */}
          <BriefSection icon={'\u{1F4CB}'} title="Summary">
            <p className="text-[var(--color-text)]">{brief.summary}</p>
            {/* Source / model chips */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {src && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-[var(--color-accent-dim)] text-[var(--color-accent)]">
                  {src.icon} {src.label}
                </span>
              )}
              {brief.modelsUsed.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center text-[10px] font-mono rounded-full px-2 py-0.5 bg-[var(--color-card-border)] text-[var(--color-text-dim)]"
                >
                  {m}
                </span>
              ))}
            </div>
          </BriefSection>

          {/* Priority actions with numbered indicators */}
          <BriefSection icon={'\u{1F3AF}'} title="Priority Actions">
            <div className="space-y-2">
              {brief.priorityActions.map((item, idx) => (
                <div key={item} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent)] text-black text-[11px] font-bold flex items-center justify-center mt-0.5">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-[var(--color-text)]">{item}</p>
                </div>
              ))}
            </div>
          </BriefSection>

          {/* Watch items */}
          <BriefSection icon={'\u{1F440}'} title="Watch Items">
            <ul className="space-y-1.5">
              {brief.watchItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                  <span className="text-[var(--color-accent)] mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </BriefSection>

          {/* Reasoning */}
          {brief.reasoning.length > 0 && (
            <BriefSection icon={'\u{1F9E0}'} title="Reasoning">
              <ul className="space-y-1.5">
                {brief.reasoning.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                    <span className="text-[var(--color-text-muted)] mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Disagreements */}
          {brief.disagreements.length > 0 && (
            <BriefSection icon={'\u26A0\uFE0F'} title="Model Disagreements / Assumptions">
              <ul className="space-y-1.5">
                {brief.disagreements.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
                    <span className="mt-0.5">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {/* Confidence note */}
          <p className="text-xs text-[var(--color-text-muted)] italic px-1">
            {brief.confidenceNote}
          </p>
        </div>
      )}
    </Card>
  );
}
