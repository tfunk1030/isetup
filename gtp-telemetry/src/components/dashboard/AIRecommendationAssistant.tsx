import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Bot, ClipboardList, Target, Eye, Brain, AlertTriangle } from 'lucide-react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import { generateAISetupBrief, getAIRecommendationMode, hasAIRecommendationConfig } from '../../lib/ai-recommendations';
import type { AISetupBrief, SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

function BriefSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[var(--color-accent)]">{icon}</span>
        <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 mb-4">
      <div className="p-4 rounded-xl bg-[var(--color-bg-subtle)]">
        <div className="h-4 animate-shimmer rounded w-3/4 mb-2" />
        <div className="h-3 animate-shimmer rounded w-1/2" />
      </div>
      <div>
        <div className="h-3 animate-shimmer rounded w-28 mb-2" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full animate-shimmer" />
              <div className="h-3 animate-shimmer rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function sourceLabel(source: AISetupBrief['source']): { icon: ReactNode; label: string } {
  if (source === 'consensus') return { icon: <Bot className="w-3.5 h-3.5" />, label: 'Consensus' };
  if (source === 'single-model') return { icon: <Bot className="w-3.5 h-3.5" />, label: 'Single Model' };
  return { icon: <Cog className="w-3.5 h-3.5" />, label: 'Rule Engine' };
}

function exactnessLabel(exactness: AISetupBrief['recommendations'][number]['exactness']): { text: string; status: 'OK' | 'HIGH' | 'RISK' } {
  if (exactness === 'exact') return { text: 'Exact', status: 'OK' };
  if (exactness === 'blocked') return { text: 'Blocked', status: 'RISK' };
  return { text: 'Inferred', status: 'HIGH' };
}

// Need to import Cog for sourceLabel fallback
import { Cog } from 'lucide-react';

export function AIRecommendationAssistant({ analysis }: Props) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<AISetupBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBrief(null);
    setError(null);
  }, [analysis.header.car, analysis.header.track, analysis.bestTime, analysis.header.samples, analysis.validLaps.length]);

  const configured = hasAIRecommendationConfig();
  const mode = getAIRecommendationMode();

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
    <Card title="AI Setup Assistant" icon={<Bot className="w-4 h-4" />}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          Synthesizes your telemetry + rule-engine outputs into a concise action brief.
        </p>
        <StatusBadge status={configured ? 'OK' : 'HIGH'} />
      </div>

      <button
        onClick={runAssistant}
        disabled={loading}
        className="btn-primary text-[13px] px-5 py-2.5 rounded-lg mb-5"
      >
        {loading ? 'Generating...' : mode === 'dual-model' ? 'Generate Dual-Model Brief' : mode === 'single-model' ? 'Generate AI Brief' : 'Generate Local Brief'}
      </button>

      {!configured && (
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          Configure `VITE_GEMINI_API_KEY` and/or `VITE_ANTHROPIC_API_KEY` to enable cloud AI synthesis. Using local rule-engine fallback otherwise.
        </p>
      )}
      {configured && mode === 'single-model' && (
        <p className="text-xs text-[var(--color-text-muted)] mb-4">
          One provider is configured, so this run will use single-model synthesis and fall back to the rule engine if that provider fails.
        </p>
      )}

      {loading && <LoadingSkeleton />}

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-[var(--color-red)]/20 bg-[var(--color-red)]/5 mb-4">
          <AlertTriangle className="w-4 h-4 text-[var(--color-red)] mt-0.5 flex-shrink-0" />
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
        <div className="space-y-4 text-sm animate-fade-slide-in">
          <BriefSection icon={<ClipboardList className="w-3.5 h-3.5" />} title="Summary">
            <p className="text-[var(--color-text)]">{brief.summary}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {src && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-[var(--color-accent-glow)] text-[var(--color-accent)]">
                  {src.icon} {src.label}
                </span>
              )}
              {brief.modelsUsed.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center text-[10px] font-mono rounded-full px-2 py-0.5 bg-[var(--color-surface)] text-[var(--color-text-dim)]"
                >
                  {m}
                </span>
              ))}
            </div>
          </BriefSection>

          <BriefSection icon={<Target className="w-3.5 h-3.5" />} title="Priority Actions">
            <div className="space-y-3">
              {brief.recommendations.map((item, idx) => {
                const exactness = exactnessLabel(item.exactness);
                return (
                  <div key={`${item.parameterKey}-${idx}`} className="rounded-xl border border-[var(--color-card-border)] p-4 hover:bg-[var(--color-surface)]/30 transition-colors">
                    <div className="flex items-start gap-2.5 mb-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-dim)] text-black text-[11px] font-bold flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <p className="text-sm font-semibold text-[var(--color-text)]">{item.displayName}</p>
                          <StatusBadge status={exactness.status} />
                          <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">{exactness.text}</span>
                        </div>
                        <p className="text-sm text-[var(--color-text)]">
                          <span className="font-mono text-[var(--color-text-dim)]">{item.currentValue}</span>
                          <span className="mx-2 text-[var(--color-accent)] font-bold">&rarr;</span>
                          <span className="font-mono font-semibold">{item.targetValue}</span>
                          <span className="ml-2 text-[var(--color-text-muted)]">({item.delta})</span>
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1.5">{item.reason}</p>
                      </div>
                    </div>

                    {item.evidence.length > 0 && (
                      <ul className="space-y-1 mb-2 ml-8">
                        {item.evidence.map((evidence) => (
                          <li key={evidence} className="flex items-start gap-2 text-xs text-[var(--color-text-dim)]">
                            <span className="text-[var(--color-accent)] mt-0.5">&bull;</span>
                            {evidence}
                          </li>
                        ))}
                      </ul>
                    )}

                    {item.verification.length > 0 && (
                      <div className="text-xs text-[var(--color-text-dim)] mb-2 ml-8">
                        <p className="uppercase tracking-wider text-[10px] text-[var(--color-text-muted)] mb-1">Verify After Change</p>
                        <ul className="space-y-1">
                          {item.verification.map((check) => (
                            <li key={check} className="flex items-start gap-2">
                              <span className="text-[var(--color-text-muted)] mt-0.5">&bull;</span>
                              {check}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {item.assumptions.length > 0 && (
                      <div className="text-xs text-[var(--color-text-muted)] ml-8">
                        <p className="uppercase tracking-wider text-[10px] mb-1">Limits / Assumptions</p>
                        <ul className="space-y-1">
                          {item.assumptions.map((assumption) => (
                            <li key={assumption} className="flex items-start gap-2">
                              <span className="mt-0.5">&bull;</span>
                              {assumption}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </BriefSection>

          <BriefSection icon={<Eye className="w-3.5 h-3.5" />} title="Watch Items">
            <ul className="space-y-2">
              {brief.watchItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                  <span className="text-[var(--color-accent)] mt-0.5">&bull;</span>
                  {item}
                </li>
              ))}
            </ul>
          </BriefSection>

          {brief.reasoning.length > 0 && (
            <BriefSection icon={<Brain className="w-3.5 h-3.5" />} title="Reasoning">
              <ul className="space-y-2">
                {brief.reasoning.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                    <span className="text-[var(--color-text-muted)] mt-0.5">&bull;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {brief.disagreements.length > 0 && (
            <BriefSection icon={<AlertTriangle className="w-3.5 h-3.5" />} title="Model Disagreements / Assumptions">
              <ul className="space-y-2">
                {brief.disagreements.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
                    <span className="mt-0.5">&bull;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          <p className="text-xs text-[var(--color-text-muted)] italic px-1">
            {brief.confidenceNote}
          </p>
        </div>
      )}
    </Card>
  );
}
