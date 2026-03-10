import type {
  CarProfile,
  ConfidenceLevel,
  NormalizedSetup,
  NormalizedSetupParameter,
  SetupMappingQuality,
  SetupParameterGroup,
} from './types';

type SetupEntry = {
  path: string;
  segments: string[];
  value: unknown;
};

type ParameterSpec = {
  parameterKey: string;
  displayName: string;
  group: SetupParameterGroup;
  axle?: 'front' | 'rear';
  corner?: 'LF' | 'RF' | 'LR' | 'RR';
  paths: string[][];
  supportedArchitectures?: Array<'lmdh' | 'lmh'>;
  enabled?: (carProfile?: CarProfile) => boolean;
};

type MatchCandidate = {
  entry: SetupEntry;
  score: number;
  quality: Exclude<SetupMappingQuality, 'ambiguous'>;
};

type MatchResult = {
  entry: SetupEntry;
  quality: SetupMappingQuality;
  candidateSourcePaths?: string[];
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function makeSegments(path: string): string[] {
  return path.split('.').map(normalizeToken).filter(Boolean);
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value == null) return '';
  return JSON.stringify(value);
}

function parseDisplayValue(rawValue: string): Pick<NormalizedSetupParameter, 'displayValue' | 'valueType' | 'numericValue' | 'unit'> {
  const trimmed = rawValue.trim();
  const match = trimmed.match(/(-?\d+(?:\.\d+)?)(?:\s*([a-zA-Z%°/]+))?/);
  if (!match) {
    return {
      displayValue: trimmed,
      valueType: 'string',
    };
  }

  const numericValue = Number(match[1]);
  if (!Number.isFinite(numericValue)) {
    return {
      displayValue: trimmed,
      valueType: 'string',
    };
  }

  return {
    displayValue: trimmed,
    valueType: 'number',
    numericValue,
    unit: match[2],
  };
}

export function flattenSetup(obj: Record<string, unknown>, prefix = ''): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flattenSetup(value as Record<string, unknown>, nextKey));
    } else {
      out.push([nextKey, value]);
    }
  }
  return out;
}

function toEntries(rawSetup: Record<string, unknown>): SetupEntry[] {
  return flattenSetup(rawSetup).map(([path, value]) => ({
    path,
    segments: makeSegments(path),
    value,
  }));
}

function findContiguousMatchIndex(segments: string[], wanted: string[]): number {
  if (wanted.length === 0 || wanted.length > segments.length) return -1;
  for (let i = 0; i <= segments.length - wanted.length; i++) {
    let ok = true;
    for (let j = 0; j < wanted.length; j++) {
      if (segments[i + j] !== wanted[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function orderedSubsequenceIndices(segments: string[], wanted: string[]): number[] | null {
  if (wanted.length === 0) return [];
  const indices: number[] = [];
  let wantedIdx = 0;
  for (let i = 0; i < segments.length && wantedIdx < wanted.length; i++) {
    if (segments[i] === wanted[wantedIdx]) {
      indices.push(i);
      wantedIdx++;
    }
  }
  return wantedIdx === wanted.length ? indices : null;
}

function scoreCandidate(entry: SetupEntry, pathSpec: string[]): MatchCandidate | null {
  const wanted = pathSpec.map(normalizeToken);
  if (wanted.length === 0) return null;

  const entrySegments = entry.segments;
  const entryLen = entrySegments.length;
  const wantedLen = wanted.length;

  // Tier 1: exact segment equality
  if (entryLen === wantedLen && entrySegments.every((segment, index) => segment === wanted[index])) {
    return { entry, score: 0, quality: 'exact' };
  }

  // Tier 2: exact suffix match (strong deterministic match in nested structures)
  const suffixStart = entryLen - wantedLen;
  if (
    suffixStart >= 0
    && entrySegments.slice(suffixStart).every((segment, index) => segment === wanted[index])
  ) {
    return { entry, score: 10 + suffixStart, quality: 'exact' };
  }

  // Tier 3: contiguous ordered match elsewhere in path
  const contiguousIdx = findContiguousMatchIndex(entrySegments, wanted);
  if (contiguousIdx >= 0) {
    return {
      entry,
      score: 100 + contiguousIdx + (entryLen - wantedLen),
      quality: 'ordered',
    };
  }

  // Tier 4: ordered subsequence fallback (still deterministic, but weaker)
  const orderedIndices = orderedSubsequenceIndices(entrySegments, wanted);
  if (orderedIndices) {
    const span = orderedIndices[orderedIndices.length - 1] - orderedIndices[0] + 1;
    const gaps = Math.max(0, span - wantedLen);
    return {
      entry,
      score: 1000 + gaps + (entryLen - wantedLen),
      quality: 'ordered',
    };
  }

  return null;
}

function findBestEntry(entries: SetupEntry[], pathSpecs: string[][]): MatchResult | null {
  const candidates: MatchCandidate[] = [];

  for (const entry of entries) {
    for (const pathSpec of pathSpecs) {
      const candidate = scoreCandidate(entry, pathSpec);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.entry.segments.length !== b.entry.segments.length) return a.entry.segments.length - b.entry.segments.length;
    return a.entry.path.localeCompare(b.entry.path);
  });

  const bestScore = candidates[0].score;
  const bestCandidates = candidates.filter((candidate) => candidate.score === bestScore);
  const candidatePaths = [...new Set(bestCandidates.map((candidate) => candidate.entry.path))];
  const chosen = bestCandidates[0];

  return {
    entry: chosen.entry,
    quality: candidatePaths.length > 1 ? 'ambiguous' : chosen.quality,
    candidateSourcePaths: candidatePaths.length > 1 ? candidatePaths : undefined,
  };
}

function inferConfidence(quality: SetupMappingQuality): ConfidenceLevel {
  if (quality === 'exact') return 'HIGH';
  if (quality === 'ordered') return 'MEDIUM';
  return 'LOW';
}

function makeParameter(spec: ParameterSpec, match: MatchResult): NormalizedSetupParameter {
  const entry = match.entry;
  const rawValue = stringifyValue(entry.value);
  const parsed = parseDisplayValue(rawValue);
  return {
    parameterKey: spec.parameterKey,
    displayName: spec.displayName,
    group: spec.group,
    axle: spec.axle,
    corner: spec.corner,
    sourcePath: entry.path,
    rawValue,
    confidence: inferConfidence(match.quality),
    mappingQuality: match.quality,
    candidateSourcePaths: match.candidateSourcePaths,
    ...parsed,
  };
}

function buildParameterSpecs(carProfile?: CarProfile): ParameterSpec[] {
  const pushrodParam = carProfile?.pushrodParamName ?? 'PushrodLengthOffset';
  const brakesDiffPrefix = carProfile?.setupPathPrefix.brakesDiff ?? 'BrakesDriveUnit';
  const dampersPrefix = carProfile?.setupPathPrefix.dampers ?? 'Chassis';
  const rearHeaveSpring = carProfile?.architecture === 'lmh' ? 'HeaveSpring' : 'ThirdSpring';
  const rearHeavePerch = carProfile?.architecture === 'lmh' ? 'HeavePerchOffset' : 'ThirdPerchOffset';
  const frontDamperPrefix = dampersPrefix === 'Dampers'
    ? ['Dampers', 'LeftFrontDamper']
    : ['Chassis', 'LeftFront'];
  const rightFrontDamperPrefix = dampersPrefix === 'Dampers'
    ? ['Dampers', 'RightFrontDamper']
    : ['Chassis', 'RightFront'];
  const leftRearDamperPrefix = dampersPrefix === 'Dampers'
    ? ['Dampers', 'LeftRearDamper']
    : ['Chassis', 'LeftRear'];
  const rightRearDamperPrefix = dampersPrefix === 'Dampers'
    ? ['Dampers', 'RightRearDamper']
    : ['Chassis', 'RightRear'];

  return [
    {
      parameterKey: 'brakes.bias',
      displayName: 'Brake bias',
      group: 'brakes',
      paths: [[brakesDiffPrefix, 'BrakeSpec', 'BrakePressureBias']],
    },
    {
      parameterKey: 'brakes.migration',
      displayName: 'Brake migration',
      group: 'brakes',
      paths: [[brakesDiffPrefix, 'BrakeSpec', 'BrakeMigration'], [brakesDiffPrefix, 'BrakeMigration']],
      enabled: (profile) => Boolean(profile?.hasBrakeMigration),
    },
    {
      parameterKey: 'aero.rearWingAngle',
      displayName: 'Rear wing angle',
      group: 'aero',
      paths: [['AeroSettings', 'RearWingAngle']],
    },
    {
      parameterKey: 'platform.frontPushrod',
      displayName: 'Front pushrod offset',
      group: 'platform',
      axle: 'front',
      paths: [['Chassis', 'Front', pushrodParam]],
    },
    {
      parameterKey: 'platform.rearPushrod',
      displayName: 'Rear pushrod offset',
      group: 'platform',
      axle: 'rear',
      paths: [['Chassis', 'Rear', pushrodParam]],
    },
    {
      parameterKey: 'platform.frontHeaveSpring',
      displayName: 'Front heave spring',
      group: 'platform',
      axle: 'front',
      paths: [['Chassis', 'Front', 'HeaveSpring']],
    },
    {
      parameterKey: 'platform.frontHeavePerch',
      displayName: 'Front heave perch offset',
      group: 'platform',
      axle: 'front',
      paths: [['Chassis', 'Front', 'HeavePerchOffset']],
    },
    {
      parameterKey: 'platform.rearHeaveSpring',
      displayName: carProfile?.architecture === 'lmh' ? 'Rear heave spring' : 'Rear third spring',
      group: 'platform',
      axle: 'rear',
      paths: [['Chassis', 'Rear', rearHeaveSpring]],
    },
    {
      parameterKey: 'platform.rearHeavePerch',
      displayName: carProfile?.architecture === 'lmh' ? 'Rear heave perch offset' : 'Rear third perch offset',
      group: 'platform',
      axle: 'rear',
      paths: [['Chassis', 'Rear', rearHeavePerch]],
    },
    {
      parameterKey: 'suspension.frontArbSize',
      displayName: 'Front ARB size',
      group: 'suspension',
      axle: 'front',
      paths: [['Chassis', 'Front', 'ArbSize']],
    },
    {
      parameterKey: 'suspension.frontArbBlades',
      displayName: 'Front ARB blades',
      group: 'suspension',
      axle: 'front',
      paths: [['Chassis', 'Front', 'ArbBlades']],
    },
    {
      parameterKey: 'suspension.rearArbSize',
      displayName: 'Rear ARB size',
      group: 'suspension',
      axle: 'rear',
      paths: [['Chassis', 'Rear', 'ArbSize']],
    },
    {
      parameterKey: 'suspension.rearArbBlades',
      displayName: 'Rear ARB blades',
      group: 'suspension',
      axle: 'rear',
      paths: [['Chassis', 'Rear', 'ArbBlades']],
    },
    {
      parameterKey: 'alignment.frontToe',
      displayName: 'Front toe',
      group: 'alignment',
      axle: 'front',
      paths: [['Chassis', 'Front', 'ToeIn']],
    },
    {
      parameterKey: 'alignment.rearToe',
      displayName: 'Rear toe',
      group: 'alignment',
      axle: 'rear',
      paths: [['Chassis', 'Rear', 'ToeIn']],
    },
    {
      parameterKey: 'alignment.frontCamber',
      displayName: 'Front camber',
      group: 'alignment',
      axle: 'front',
      paths: [['Chassis', 'LeftFront', 'Camber']],
    },
    {
      parameterKey: 'alignment.rearCamber',
      displayName: 'Rear camber',
      group: 'alignment',
      axle: 'rear',
      paths: [['Chassis', 'LeftRear', 'Camber']],
    },
    {
      parameterKey: 'tyres.LF.startingPressure',
      displayName: 'LF starting pressure',
      group: 'tyres',
      corner: 'LF',
      paths: [['LeftFront', 'StartingPressure']],
    },
    {
      parameterKey: 'tyres.RF.startingPressure',
      displayName: 'RF starting pressure',
      group: 'tyres',
      corner: 'RF',
      paths: [['RightFront', 'StartingPressure']],
    },
    {
      parameterKey: 'tyres.LR.startingPressure',
      displayName: 'LR starting pressure',
      group: 'tyres',
      corner: 'LR',
      paths: [['LeftRear', 'StartingPressure']],
    },
    {
      parameterKey: 'tyres.RR.startingPressure',
      displayName: 'RR starting pressure',
      group: 'tyres',
      corner: 'RR',
      paths: [['RightRear', 'StartingPressure']],
    },
    {
      parameterKey: 'diff.rearPreload',
      displayName: 'Rear diff preload',
      group: 'diff',
      axle: 'rear',
      paths: [[brakesDiffPrefix, 'RearDiffSpec', 'Preload']],
    },
    {
      parameterKey: 'diff.frontPreload',
      displayName: 'Front diff preload',
      group: 'diff',
      axle: 'front',
      paths: [[brakesDiffPrefix, 'FrontDiffSpec', 'Preload']],
      supportedArchitectures: ['lmh'],
    },
    {
      parameterKey: 'dampers.LF.hsComp',
      displayName: 'LF high-speed compression',
      group: 'dampers',
      corner: 'LF',
      paths: [[...frontDamperPrefix, 'HsCompDamping']],
    },
    {
      parameterKey: 'dampers.RF.hsComp',
      displayName: 'RF high-speed compression',
      group: 'dampers',
      corner: 'RF',
      paths: [[...rightFrontDamperPrefix, 'HsCompDamping']],
    },
    {
      parameterKey: 'dampers.LR.hsComp',
      displayName: 'LR high-speed compression',
      group: 'dampers',
      corner: 'LR',
      paths: [[...leftRearDamperPrefix, 'HsCompDamping']],
    },
    {
      parameterKey: 'dampers.RR.hsComp',
      displayName: 'RR high-speed compression',
      group: 'dampers',
      corner: 'RR',
      paths: [[...rightRearDamperPrefix, 'HsCompDamping']],
    },
    {
      parameterKey: 'dampers.LF.hsSlope',
      displayName: 'LF high-speed slope',
      group: 'dampers',
      corner: 'LF',
      paths: [[...frontDamperPrefix, 'HsCompSlope']],
    },
    {
      parameterKey: 'dampers.RF.hsSlope',
      displayName: 'RF high-speed slope',
      group: 'dampers',
      corner: 'RF',
      paths: [[...rightFrontDamperPrefix, 'HsCompSlope']],
    },
    {
      parameterKey: 'dampers.LR.hsSlope',
      displayName: 'LR high-speed slope',
      group: 'dampers',
      corner: 'LR',
      paths: [[...leftRearDamperPrefix, 'HsCompSlope']],
    },
    {
      parameterKey: 'dampers.RR.hsSlope',
      displayName: 'RR high-speed slope',
      group: 'dampers',
      corner: 'RR',
      paths: [[...rightRearDamperPrefix, 'HsCompSlope']],
    },
  ];
}

export function normalizeSetup(rawSetup: Record<string, unknown>, carProfile?: CarProfile): NormalizedSetup {
  const entries = toEntries(rawSetup);
  const parameters: NormalizedSetupParameter[] = [];
  const missingKeys: string[] = [];
  const unsupportedKeys: string[] = [];
  const ambiguousKeys: string[] = [];
  const mappingWarnings: string[] = [];
  const architecture = carProfile?.architecture ?? 'unknown';

  for (const spec of buildParameterSpecs(carProfile)) {
    if (spec.supportedArchitectures && architecture !== 'unknown' && !spec.supportedArchitectures.includes(architecture)) {
      unsupportedKeys.push(spec.parameterKey);
      continue;
    }
    if (spec.enabled && !spec.enabled(carProfile)) {
      unsupportedKeys.push(spec.parameterKey);
      continue;
    }
    const match = findBestEntry(entries, spec.paths);
    if (!match) {
      missingKeys.push(spec.parameterKey);
      continue;
    }
    if (match.quality === 'ambiguous') {
      ambiguousKeys.push(spec.parameterKey);
      mappingWarnings.push(
        `${spec.parameterKey}: ambiguous mapping among ${match.candidateSourcePaths?.join(', ')}`
      );
    }
    parameters.push(makeParameter(spec, match));
  }

  parameters.sort((a, b) => a.parameterKey.localeCompare(b.parameterKey));
  ambiguousKeys.sort((a, b) => a.localeCompare(b));
  mappingWarnings.sort((a, b) => a.localeCompare(b));

  return { architecture, parameters, missingKeys, unsupportedKeys, ambiguousKeys, mappingWarnings };
}

export function getNormalizedParameter(
  setup: NormalizedSetup,
  parameterKey: string
): NormalizedSetupParameter | undefined {
  return setup.parameters.find((parameter) => parameter.parameterKey === parameterKey);
}
