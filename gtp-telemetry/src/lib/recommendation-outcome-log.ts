import type { RecommendationOutcomeLog, SessionAnalysis } from './types';

const STORAGE_KEY = 'gtpTelemetry.recommendationOutcomeLogs.v1';
const MAX_LOGS = 100;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function buildRecommendationOutcomeLog(analysis: SessionAnalysis): RecommendationOutcomeLog {
  return {
    schemaVersion: 'v1',
    createdAtIso: new Date().toISOString(),
    session: {
      car: analysis.header.car,
      track: analysis.header.track,
      bestLapSeconds: Number.isFinite(analysis.bestTime) ? Number(analysis.bestTime.toFixed(3)) : null,
      validLapCount: analysis.validLaps.length,
      dataConfidence: analysis.dataQuality.confidence,
    },
    trustGuardrails: analysis.recommendationGuardrails,
    recommendations: analysis.recommendations.map((recommendation) => ({
      recommendationId: recommendation.id,
      parameterKey: recommendation.parameterKey,
      title: recommendation.title,
      action: recommendation.action,
      exactness: recommendation.exactness,
      confidence: recommendation.confidence,
      expectedGain: recommendation.expectedGain,
      successProbability: recommendation.successProbability,
      status: 'pending',
    })),
  };
}

export function getRecommendationOutcomeLogs(): RecommendationOutcomeLog[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as RecommendationOutcomeLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecommendationOutcomeLog(log: RecommendationOutcomeLog): number {
  if (!isBrowser()) return 0;
  const existing = getRecommendationOutcomeLogs();
  const next = [log, ...existing].slice(0, MAX_LOGS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next.length;
}

export function exportRecommendationOutcomeLogs(): { count: number; fileName: string } {
  const logs = getRecommendationOutcomeLogs();
  const payload = {
    schemaVersion: 'v1',
    exportedAtIso: new Date().toISOString(),
    count: logs.length,
    logs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const fileName = `gtp-recommendation-outcomes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return { count: logs.length, fileName };
}
