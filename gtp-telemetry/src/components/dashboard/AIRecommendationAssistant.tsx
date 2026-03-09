import { useEffect, useState } from 'react';
import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import { generateAISetupBrief, hasAIRecommendationConfig } from '../../lib/ai-recommendations';
import type { AISetupBrief, SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
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

      {error && (
        <p className="text-xs text-[var(--color-red)] mb-3">{error}</p>
      )}

      {brief && (
        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-lg bg-[var(--color-bg)]">
            <p className="text-[var(--color-text)]">{brief.summary}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Source: {brief.source === 'consensus' ? 'Gemini + Opus consensus' : brief.source === 'single-model' ? 'Single-model AI' : 'Rule-engine fallback'}
            </p>
            {brief.modelsUsed.length > 0 && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Models: {brief.modelsUsed.join(', ')}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Priority Actions
            </p>
            <ul className="list-disc pl-5 text-[var(--color-text)] space-y-1">
              {brief.priorityActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
              Watch Items
            </p>
            <ul className="list-disc pl-5 text-[var(--color-text-dim)] space-y-1">
              {brief.watchItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {brief.reasoning.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Reasoning
              </p>
              <ul className="list-disc pl-5 text-[var(--color-text-dim)] space-y-1">
                {brief.reasoning.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {brief.disagreements.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Model Disagreements / Assumptions
              </p>
              <ul className="list-disc pl-5 text-[var(--color-text-muted)] space-y-1">
                {brief.disagreements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-[var(--color-text-muted)]">
            {brief.confidenceNote}
          </p>
        </div>
      )}
    </Card>
  );
}
