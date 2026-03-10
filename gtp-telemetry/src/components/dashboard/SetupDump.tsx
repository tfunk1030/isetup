import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Card } from '../shared/Card';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function SetupDump({ analysis }: Props) {
  const [showSetup, setShowSetup] = useState(false);

  return (
    <Card title="Full Setup (from IBT Session Info)" icon={<Wrench className="w-4 h-4" />}>
      <div className="mb-5 p-4 rounded-xl bg-[var(--color-bg-subtle)] text-xs text-[var(--color-text-muted)]">
        <p>
          Quality: {analysis.dataQuality.confidence} &bull; Valid laps: {analysis.dataQuality.validLapCount}
        </p>
        {analysis.dataQuality.parserWarnings.length > 0 && (
          <p className="mt-1">Parser warnings: {analysis.dataQuality.parserWarnings.length}</p>
        )}
      </div>
      <button
        onClick={() => setShowSetup(!showSetup)}
        className="btn-primary text-[13px] px-5 py-2.5 rounded-lg mb-5"
      >
        {showSetup ? 'Hide Setup' : 'Show Full Setup'}
      </button>
      {showSetup && (
        <div className="max-h-[500px] overflow-auto font-mono text-xs leading-7 rounded-xl bg-[var(--color-bg-subtle)] p-4">
          {analysis.setup.map(([k, v], i) => (
            <div
              key={i}
              className="flex border-b border-[var(--color-card-border)]/50 py-0.5 hover:bg-[var(--color-surface)] rounded px-2 transition-colors"
            >
              <span className="text-[var(--color-text-dim)] min-w-[340px] shrink-0">
                {k as string}
              </span>
              <span className="text-[var(--color-text)] font-semibold">
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
