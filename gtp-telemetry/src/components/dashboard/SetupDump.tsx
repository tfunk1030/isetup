import { useState } from 'react';
import { Card } from '../shared/Card';
import type { SessionAnalysis } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

export function SetupDump({ analysis }: Props) {
  const [showSetup, setShowSetup] = useState(false);

  return (
    <Card title="Full Setup (from IBT Session Info)" icon={'\u{1F527}'}>
      <button
        onClick={() => setShowSetup(!showSetup)}
        className="bg-[var(--color-accent)] text-black border-none px-4 py-2 rounded-md cursor-pointer text-[13px] font-semibold mb-4 hover:opacity-90 transition-opacity"
      >
        {showSetup ? 'Hide Setup' : 'Show Full Setup'}
      </button>
      {showSetup && (
        <div className="max-h-[500px] overflow-auto font-mono text-xs leading-7">
          {analysis.setup.map(([k, v], i) => (
            <div
              key={i}
              className="flex border-b border-[var(--color-card-border)] py-0.5"
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
