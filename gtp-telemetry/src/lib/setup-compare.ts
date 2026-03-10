// ═══════════════════════════════════════════════════════════════
// SETUP COMPARE — Diff two setups and predict handling impact
// ═══════════════════════════════════════════════════════════════

import yaml from 'js-yaml';
import type {
  CarProfile,
  CompareResult,
  NormalizedSetup,
  SetupDiff,
} from './types';
import { normalizeSetup } from './setup-normalization';
import { getImpactRank } from './domain-knowledge';

// ── Parse pasted setup text ─────────────────────────────────

export function parseSetupInput(text: string, carProfile?: CarProfile): NormalizedSetup | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    // Try JSON first
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return normalizeSetup(parsed, carProfile);
  } catch {
    // Fall through to YAML
  }

  try {
    const parsed = yaml.load(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeSetup(parsed as Record<string, unknown>, carProfile);
    }
  } catch {
    // Fall through
  }

  return null;
}

// ── Handling impact predictions ─────────────────────────────

type ImpactDirection = SetupDiff['impactDirection'];
type ImpactMagnitude = SetupDiff['impactMagnitude'];

interface ImpactPrediction {
  impact: string;
  direction: ImpactDirection;
  magnitude: ImpactMagnitude;
}

const PARAMETER_IMPACT_MAP: Record<string, (delta: number) => ImpactPrediction> = {
  'aero.rearWingAngle': (d) => ({
    impact: d > 0 ? 'More downforce, less top speed' : 'Less downforce, more top speed',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 1 ? 'large' : 'medium',
  }),
  'platform.frontHeaveSpring': (d) => ({
    impact: d > 0 ? 'Stiffer front platform — less bottoming, more understeer' : 'Softer front platform — more mechanical grip, more bottoming risk',
    direction: d > 0 ? 'negative' : 'positive',
    magnitude: Math.abs(d) >= 10 ? 'large' : 'medium',
  }),
  'platform.rearHeaveSpring': (d) => ({
    impact: d > 0 ? 'Stiffer rear platform — more oversteer under load' : 'Softer rear platform — more rear mechanical grip',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 10 ? 'large' : 'medium',
  }),
  'suspension.frontArbBlades': (d) => ({
    impact: d > 0 ? 'Stiffer front ARB — less body roll, more mid-corner understeer' : 'Softer front ARB — more body roll, more mid-corner rotation',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 2 ? 'large' : 'medium',
  }),
  'suspension.rearArbBlades': (d) => ({
    impact: d > 0 ? 'Stiffer rear ARB — less body roll, more mid-corner oversteer' : 'Softer rear ARB — more body roll, more rear stability',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 2 ? 'large' : 'medium',
  }),
  'brakes.bias': (d) => ({
    impact: d > 0 ? 'More front bias — better stability, less turn-in rotation' : 'More rear bias — sharper turn-in, less stability',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 1 ? 'large' : 'small',
  }),
  'diff.rearPreload': (d) => ({
    impact: d > 0 ? 'Higher diff preload — more traction stability, less rotation on power' : 'Lower diff preload — more rotation on power, less traction',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 10 ? 'large' : 'medium',
  }),
  'alignment.frontCamber': (d) => ({
    impact: d < 0 ? 'More negative camber — better lateral grip, less braking surface' : 'Less negative camber — more braking surface, less lateral grip',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 0.3 ? 'medium' : 'small',
  }),
  'alignment.rearCamber': (d) => ({
    impact: d < 0 ? 'More negative rear camber — more rear lateral grip' : 'Less negative rear camber — less rear lateral grip',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 0.3 ? 'medium' : 'small',
  }),
  'alignment.frontToe': (d) => ({
    impact: d > 0 ? 'More front toe-in — more straight-line stability, less turn-in' : 'More front toe-out — sharper turn-in, less stability',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 0.5 ? 'medium' : 'small',
  }),
  'alignment.rearToe': (d) => ({
    impact: d > 0 ? 'More rear toe-in — more rear stability' : 'More rear toe-out — less rear stability (unusual)',
    direction: d > 0 ? 'positive' : 'negative',
    magnitude: Math.abs(d) >= 0.5 ? 'medium' : 'small',
  }),
  'platform.frontPushrod': (d) => ({
    impact: d > 0 ? 'Higher front ride height — less front downforce, more rake' : 'Lower front ride height — more front downforce, less rake',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 1 ? 'large' : 'medium',
  }),
  'platform.rearPushrod': (d) => ({
    impact: d > 0 ? 'Higher rear ride height — less rear downforce, less rake' : 'Lower rear ride height — more rear downforce, more rake',
    direction: 'context-dependent',
    magnitude: Math.abs(d) >= 1 ? 'large' : 'medium',
  }),
};

function predictImpact(parameterKey: string, deltaNum: number): ImpactPrediction {
  const predictor = PARAMETER_IMPACT_MAP[parameterKey];
  if (predictor && deltaNum !== 0) return predictor(deltaNum);

  // Generic prediction based on parameter group
  if (parameterKey.includes('pressure')) {
    return {
      impact: deltaNum > 0 ? 'Higher starting pressure' : 'Lower starting pressure',
      direction: 'context-dependent',
      magnitude: Math.abs(deltaNum) >= 2 ? 'medium' : 'small',
    };
  }
  if (parameterKey.includes('Comp') || parameterKey.includes('Slope')) {
    return {
      impact: deltaNum > 0 ? 'Stiffer damper setting' : 'Softer damper setting',
      direction: 'context-dependent',
      magnitude: 'small',
    };
  }

  return {
    impact: deltaNum > 0 ? 'Increased value' : 'Decreased value',
    direction: 'neutral',
    magnitude: 'small',
  };
}

// ── Compare two setups ──────────────────────────────────────

export function compareSetups(
  setupA: NormalizedSetup,
  setupB: NormalizedSetup,
  labelA = 'Setup A',
  labelB = 'Setup B'
): CompareResult {
  const diffs: SetupDiff[] = [];

  // Match parameters by key
  for (const paramA of setupA.parameters) {
    const paramB = setupB.parameters.find((p) => p.parameterKey === paramA.parameterKey);
    if (!paramB) continue;

    // Skip if identical
    if (paramA.displayValue === paramB.displayValue) continue;

    const numA = paramA.numericValue;
    const numB = paramB.numericValue;
    let deltaStr: string;
    let deltaNum = 0;

    if (numA !== undefined && numB !== undefined) {
      deltaNum = numB - numA;
      const sign = deltaNum > 0 ? '+' : '';
      const unit = paramA.unit || paramB.unit || '';
      deltaStr = `${sign}${deltaNum.toFixed(2)}${unit ? ' ' + unit : ''}`;
    } else {
      deltaStr = `${paramA.displayValue} → ${paramB.displayValue}`;
    }

    // Filter noise: skip tiny numeric differences
    if (numA !== undefined && numB !== undefined && Math.abs(deltaNum) < 0.01) continue;

    const impact = predictImpact(paramA.parameterKey, deltaNum);

    diffs.push({
      parameterKey: paramA.parameterKey,
      displayName: paramA.displayName,
      group: paramA.group,
      setupA: { value: paramA.displayValue, numeric: numA },
      setupB: { value: paramB.displayValue, numeric: numB },
      delta: deltaStr,
      handlingImpact: impact.impact,
      impactDirection: impact.direction,
      impactMagnitude: impact.magnitude,
      hierarchyRank: getImpactRank(paramA.parameterKey),
    });
  }

  // Sort by impact hierarchy
  diffs.sort((a, b) => a.hierarchyRank - b.hierarchyRank);

  // Build summary
  const largeChanges = diffs.filter((d) => d.impactMagnitude === 'large');
  const summary = diffs.length === 0
    ? 'No meaningful differences between the two setups.'
    : largeChanges.length > 0
      ? `${diffs.length} parameter differences found. ${largeChanges.length} significant change${largeChanges.length > 1 ? 's' : ''}: ${largeChanges.map((d) => d.displayName).join(', ')}.`
      : `${diffs.length} parameter differences found, all minor adjustments.`;

  return {
    diffs,
    summary,
    setupALabel: labelA,
    setupBLabel: labelB,
  };
}
