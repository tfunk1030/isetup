import { Card } from '../shared/Card';
import { StatusBadge } from '../shared/StatusBadge';
import type { RecommendationSeverity, SessionAnalysis, SetupRecommendation } from '../../lib/types';

interface Props {
  analysis: SessionAnalysis;
}

function severityToStatus(severity: RecommendationSeverity): 'OK' | 'HIGH' | 'HOT' {
  if (severity === 'CRITICAL') return 'HOT';
  if (severity === 'WARNING') return 'HIGH';
  return 'OK';
}

function confidenceToStatus(confidence: SetupRecommendation['confidence']): 'OK' | 'HIGH' | 'RISK' {
  if (confidence === 'HIGH') return 'OK';
  if (confidence === 'MEDIUM') return 'HIGH';
  return 'RISK';
}

export function SetupRecommendationsPanel({ analysis }: Props) {
  const { recommendations, dataQuality } = analysis;
  const categoryOrder: SetupRecommendation['category'][] = [
    'AERO',
    'PLATFORM',
    'TYRES',
    'DYNAMICS',
    'AIDS',
    'BRAKES',
    'POWERTRAIN',
    'TRACK',
  ];

  const grouped = categoryOrder
    .map((category) => ({
      category,
      items: recommendations.filter((r) => r.category === category),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <Card title="Setup Recommendations" icon={'\u{1F9E0}'}>
      <div className="mb-4 p-3 rounded-lg bg-[var(--color-bg)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[var(--color-text-dim)] text-sm">Dataset confidence</span>
          <StatusBadge status={confidenceToStatus(dataQuality.confidence)} />
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          {dataQuality.validLapCount} valid laps • {dataQuality.optionalMissingChannels.length} optional channels missing
        </p>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No actionable setup recommendations generated for this dataset.
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div key={group.category}>
              <p className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                {group.category}
              </p>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--color-card-border)] p-3">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{item.title}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">Priority {item.priority}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={severityToStatus(item.severity)} />
                        <StatusBadge status={confidenceToStatus(item.confidence)} />
                      </div>
                    </div>
                    <p className="text-sm text-[var(--color-text)] mb-2">{item.action}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mb-2">{item.rationale}</p>
                    {item.evidence.length > 0 && (
                      <ul className="text-xs text-[var(--color-text-dim)] list-disc pl-4 space-y-1">
                        {item.evidence.slice(0, 3).map((ev) => (
                          <li key={ev}>{ev}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
