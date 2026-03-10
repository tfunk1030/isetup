import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Bot, Brain, ChevronDown, ChevronUp, ClipboardList, Eye, MessageSquare, Target,
} from 'lucide-react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import {
  getLastAIProviderDebugReport,
  type AIProviderDebugReport,
  generateAISetupBrief,
  getAIRecommendationMode,
  hasAIRecommendationConfig,
} from '../../lib/ai-recommendations';
import type { AISetupBrief, SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

function BriefSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--color-accent)]">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{title}</p>
      </div>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mb-4 space-y-3">
      <div className="rounded-xl bg-[var(--color-bg-subtle)] p-4">
        <div className="mb-2 h-4 w-3/4 animate-shimmer rounded" />
        <div className="h-3 w-1/2 animate-shimmer rounded" />
      </div>
      <div>
        <div className="mb-2 h-3 w-28 animate-shimmer rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-5 w-5 animate-shimmer rounded-full" />
              <div className="h-3 flex-1 animate-shimmer rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function sourceLabel(source: AISetupBrief['source']): { icon: ReactNode; label: string } {
  if (source === 'consensus') return { icon: <Bot className="h-3.5 w-3.5" />, label: 'Dual-Model Consensus' };
  return { icon: <Bot className="h-3.5 w-3.5" />, label: 'Single Model' };
}

function exactnessLabel(exactness: AISetupBrief['recommendations'][number]['exactness']): { text: string; status: 'OK' | 'HIGH' | 'RISK' } {
  if (exactness === 'exact') return { text: 'Exact', status: 'OK' };
  if (exactness === 'blocked') return { text: 'Blocked', status: 'RISK' };
  return { text: 'Inferred', status: 'HIGH' };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

const FEEDBACK_PRESETS = [
  'Understeer on entry',
  'Understeer mid-corner',
  'Oversteer on exit',
  'Oversteer under braking',
  'Rear instability at high speed',
  'Poor traction out of slow corners',
  'Car bottoming too much',
  'Front tyres overheating',
  'Rear tyres overheating',
  'Car feels too stiff over kerbs',
  'Snap oversteer on turn-in',
  'Push in fast corners',
] as const;

export function AIRecommendationAssistant({ analysis }: Props) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<AISetupBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugReport, setDebugReport] = useState<AIProviderDebugReport | null>(null);
  const [driverFeedback, setDriverFeedback] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const runIdRef = useRef(0);

  const configured = hasAIRecommendationConfig();
  const mode = getAIRecommendationMode();
  const analysisKey = useMemo(
    () => `${analysis.header.car}|${analysis.header.track}|${analysis.header.samples}|${analysis.validLaps.length}|${analysis.bestTime.toFixed(3)}`,
    [analysis.header.car, analysis.header.track, analysis.header.samples, analysis.validLaps.length, analysis.bestTime],
  );

  const runAssistant = useCallback(async () => {
    const runId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    setDebugReport(null);

    const feedback = driverFeedback.trim() || undefined;
    try {
      const result = await generateAISetupBrief(analysis, feedback);
      if (runId !== runIdRef.current) return;
      setBrief(result);
      setDebugReport(getLastAIProviderDebugReport());
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setBrief(null);
      setError(err instanceof Error ? err.message : String(err));
      setDebugReport(getLastAIProviderDebugReport());
    } finally {
      if (runId === runIdRef.current) {
        setLoading(false);
      }
    }
  }, [analysis, driverFeedback]);

  useEffect(() => {
    runIdRef.current += 1;
    setBrief(null);
    setError(null);
    setDebugReport(null);
    setLoading(false);
    setFeedbackOpen(true);
  }, [analysisKey]);

  const src = brief ? sourceLabel(brief.source) : null;
  const attemptedModels = useMemo(
    () => dedupe((debugReport?.providers || []).map((provider) => provider.model)),
    [debugReport]
  );
  const ranModels = useMemo(
    () => dedupe((debugReport?.providers || [])
      .filter((provider) => provider.status === 'success')
      .map((provider) => provider.model)),
    [debugReport]
  );

  return (
    <Card title="AI Setup Assistant" icon={<Bot className="h-4 w-4" />}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          Describe how the car feels, then run AI analysis for targeted setup recommendations.
        </p>
        <StatusBadge status={configured ? 'OK' : 'HIGH'} />
      </div>

      <div className="mb-4">
        <button
          type="button"
          onClick={() => setFeedbackOpen(!feedbackOpen)}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface)]"
        >
          <MessageSquare className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span className="flex-1 text-xs font-semibold text-[var(--color-text)]">
            Driver Feedback
            {driverFeedback.trim() && (
              <span className="ml-2 font-normal text-[var(--color-text-muted)]">
                — {driverFeedback.trim().length > 60 ? `${driverFeedback.trim().slice(0, 60)}...` : driverFeedback.trim()}
              </span>
            )}
          </span>
          {feedbackOpen
            ? <ChevronUp className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
            : <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />}
        </button>
        {feedbackOpen && (
          <div className="mt-2 space-y-3 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-4">
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Describe how the car feels so the AI can prioritize setup changes that address your symptoms.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FEEDBACK_PRESETS.map((preset) => {
                const active = driverFeedback.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (active) {
                        setDriverFeedback((prev) =>
                          prev.replace(preset, '').replace(/[,;]\s*[,;]/g, ',').replace(/^[,;\s]+|[,;\s]+$/g, '').trim()
                        );
                      } else {
                        setDriverFeedback((prev) =>
                          prev.trim() ? `${prev.trim()}, ${preset}` : preset
                        );
                      }
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-glow)] font-semibold text-[var(--color-accent)]'
                        : 'border-[var(--color-card-border)] text-[var(--color-text-dim)] hover:border-[var(--color-accent)]/50 hover:text-[var(--color-text)]'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <textarea
              value={driverFeedback}
              onChange={(e) => setDriverFeedback(e.target.value)}
              placeholder="e.g. &quot;Car pushes hard on entry at T1 and snaps oversteer on exit of fast corners...&quot;"
              rows={3}
              className="w-full resize-y rounded-lg border border-[var(--color-card-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
            {driverFeedback.trim() && (
              <button
                type="button"
                onClick={() => setDriverFeedback('')}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"
              >
                Clear feedback
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          onClick={runAssistant}
          disabled={loading || !configured}
          className="btn-primary rounded-md px-5 py-2.5 text-[13px]"
        >
          {loading ? 'Analyzing...' : brief ? 'Re-run AI Analysis' : 'Run AI Analysis'}
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          {mode === 'dual-model' ? 'Mode: multi-provider consensus' : mode === 'single-model' ? 'Mode: single-provider AI' : 'Mode: unconfigured'}
        </span>
      </div>
      {debugReport && (
        <div className="mb-5 rounded-xl border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Model Execution
          </p>
          <p className="text-xs text-[var(--color-text-dim)]">
            Analyzed models ({attemptedModels.length}): {attemptedModels.length > 0 ? attemptedModels.join(', ') : 'none'}
          </p>
          <p className="text-xs text-[var(--color-text-dim)]">
            Ran successfully ({ranModels.length}): {ranModels.length > 0 ? ranModels.join(', ') : 'none'}
          </p>
        </div>
      )}

      {!configured && (
        <p className="mb-4 text-xs text-[var(--color-text-muted)]">
          Configure a valid AI key (`VITE_GEMINI_API_KEY`, `VITE_ANTHROPIC_API_KEY`, `VITE_OPENROUTER_API_KEY`, or `VITE_OPENAI_API_KEY`) to enable AI analysis.
        </p>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && !brief && !error && configured && (
        <div className="mb-4 rounded-xl border border-dashed border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-5 text-center">
          <MessageSquare className="mx-auto mb-2 h-5 w-5 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-muted)]">
            Add driver feedback above, then press <strong className="text-[var(--color-text)]">Run AI Analysis</strong> to start.
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-dim)]">
            Feedback is optional — you can run the analysis without it.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--color-red)]/20 bg-[var(--color-red)]/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-red)]" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-sm font-semibold text-[var(--color-red)]">AI analysis failed</p>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">{error}</p>
            {debugReport && (
              <details className="mb-2 rounded-lg border border-[var(--color-card-border)] bg-[var(--color-bg-subtle)] p-2">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--color-text-muted)]">Debug details</summary>
                <div className="mt-2 space-y-2">
                  {debugReport.providers.map((provider) => (
                    <div key={provider.provider} className="rounded-md bg-[var(--color-surface)] p-2 text-[11px] text-[var(--color-text-dim)]">
                      <p className="font-semibold text-[var(--color-text)]">
                        {provider.provider}: {provider.status.toUpperCase()} ({provider.durationMs} ms)
                      </p>
                      <p>Model: <span className="font-mono">{provider.model}</span></p>
                      <p>Base URL: <span className="font-mono">{provider.baseUrl}</span></p>
                      <p>Configured: {provider.configured ? 'yes' : 'no'} | Key valid: {provider.keyValid ? 'yes' : 'no'}</p>
                      {provider.error && <p className="text-[var(--color-red)]">Error: {provider.error}</p>}
                    </div>
                  ))}
                </div>
              </details>
            )}
            <button
              onClick={runAssistant}
              disabled={loading || !configured}
              className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-accent)] hover:underline disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {brief && (
        <div className="animate-fade-slide-in space-y-4 text-sm">
          <BriefSection icon={<ClipboardList className="h-3.5 w-3.5" />} title="Summary">
            <p className="text-[var(--color-text)]">{brief.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {src && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-glow)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
                  {src.icon} {src.label}
                </span>
              )}
              {brief.modelsUsed.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-text-dim)]"
                >
                  {m}
                </span>
              ))}
            </div>
          </BriefSection>

          <BriefSection icon={<Target className="h-3.5 w-3.5" />} title="Priority Actions">
            {brief.recommendations.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                AI did not return actionable setup deltas for this telemetry file.
              </p>
            ) : (
              <div className="space-y-3">
                {brief.recommendations.map((item, idx) => {
                  const exactness = exactnessLabel(item.exactness);
                  return (
                    <div key={`${item.parameterKey}-${idx}`} className="rounded-xl border border-[var(--color-card-border)] p-4 transition-colors hover:bg-[var(--color-surface)]/30">
                      <div className="mb-2 flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-dim)] text-[11px] font-bold text-black">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--color-text)]">{item.displayName}</p>
                            <StatusBadge status={exactness.status} />
                            <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">{exactness.text}</span>
                          </div>
                          <p className="text-sm text-[var(--color-text)]">
                            <span className="font-mono text-[var(--color-text-dim)]">{item.currentValue}</span>
                            <span className="mx-2 font-bold text-[var(--color-accent)]">&rarr;</span>
                            <span className="font-mono font-semibold">{item.targetValue}</span>
                            <span className="ml-2 text-[var(--color-text-muted)]">({item.delta})</span>
                          </p>
                          <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{item.reason}</p>
                          {item.currentSourcePath && (
                            <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                              Garage path: <span className="font-mono text-[var(--color-text-dim)]">{item.currentSourcePath}</span>
                              {item.mappingQuality && item.mappingConfidence && (
                                <span> ({item.mappingQuality}, {item.mappingConfidence})</span>
                              )}
                            </p>
                          )}
                          {item.mappingAmbiguities && item.mappingAmbiguities.length > 0 && (
                            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                              Alternative matches: <span className="font-mono text-[var(--color-text-dim)]">{item.mappingAmbiguities.join(', ')}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {item.evidence.length > 0 && (
                        <ul className="mb-2 ml-8 space-y-1">
                          {item.evidence.map((evidence) => (
                            <li key={evidence} className="flex items-start gap-2 text-xs text-[var(--color-text-dim)]">
                              <span className="mt-0.5 text-[var(--color-accent)]">&bull;</span>
                              {evidence}
                            </li>
                          ))}
                        </ul>
                      )}

                      {item.verification.length > 0 && (
                        <div className="mb-2 ml-8 text-xs text-[var(--color-text-dim)]">
                          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Verify After Change</p>
                          <ul className="space-y-1">
                            {item.verification.map((check) => (
                              <li key={check} className="flex items-start gap-2">
                                <span className="mt-0.5 text-[var(--color-text-muted)]">&bull;</span>
                                {check}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {item.assumptions.length > 0 && (
                        <div className="ml-8 text-xs text-[var(--color-text-muted)]">
                          <p className="mb-1 text-[10px] uppercase tracking-wider">Limits / Assumptions</p>
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
            )}
          </BriefSection>

          <BriefSection icon={<Eye className="h-3.5 w-3.5" />} title="Watch Items">
            {brief.watchItems.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No additional watch items were returned by the AI models.
              </p>
            ) : (
              <ul className="space-y-2">
                {brief.watchItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                    <span className="mt-0.5 text-[var(--color-accent)]">&bull;</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </BriefSection>

          {brief.reasoning.length > 0 && (
            <BriefSection icon={<Brain className="h-3.5 w-3.5" />} title="Reasoning">
              <ul className="space-y-2">
                {brief.reasoning.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[var(--color-text-dim)]">
                    <span className="mt-0.5 text-[var(--color-text-muted)]">&bull;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}

          {brief.disagreements.length > 0 && (
            <BriefSection icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Model Disagreements / Assumptions">
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

          <p className="px-1 text-xs italic text-[var(--color-text-muted)]">
            {brief.confidenceNote}
          </p>
        </div>
      )}
    </Card>
  );
}
