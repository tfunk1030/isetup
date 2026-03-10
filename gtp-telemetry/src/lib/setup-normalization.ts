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

type EntryMatch = {
  entry: SetupEntry;
  quality: SetupMappingQuality;
  score: number;
};

type BestEntryMatch = EntryMatch & {
  ambiguousPaths: string[];
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

function findContiguousStart(haystack: string[], needle: string[]): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let ok = true;
    for (let i = 0; i < needle.length; i++) {
      if (haystack[start + i] !== needle[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return -1;
}

function orderedSubsequencePenalty(haystack: string[], needle: string[]): number | null {
  if (needle.length === 0 || haystack.length < needle.length) return null;
  let h = 0;
  let penalty = 0;
  let lastMatch = -1;

  for (let n = 0; n < needle.length; n++) {
    let found = -1;
    for (let i = h; i < haystack.length; i++) {
      if (haystack[i] === needle[n]) {
        found = i;
        break;
      }
    }
    if (found === -1) return null;
    if (lastMatch >= 0) penalty += Math.max(0, found - lastMatch - 1);
    penalty += found - h; // penalize skipped tokens while searching
    lastMatch = found;
    h = found + 1;
  }

  return penalty;
}

function scoreEntryAgainstPath(entry: SetupEntry, pathSpec: string[]): EntryMatch | null {
  const wanted = pathSpec.map(normalizeToken).filter(Boolean);
  if (wanted.length === 0) return null;
  const segments = entry.segments;

  const contiguousStart = findContiguousStart(segments, wanted);
  if (contiguousStart === 0 && segments.length === wanted.length) {
    return { entry, quality: 'exact', score: 0 };
  }
  if (contiguousStart >= 0) {
    const extraSegments = segments.length - wanted.length;
    return {
      entry,
      quality: 'ordered',
      score: 10 + extraSegments * 2 + contiguousStart,
    };
  }

  const subsequencePenalty = orderedSubsequencePenalty(segments, wanted);
  if (subsequencePenalty == null) return null;
  const extraSegments = segments.length - wanted.length;
  return {
    entry,
    quality: 'ordered',
    score: 50 + extraSegments * 3 + subsequencePenalty,
  };
}

function findBestEntry(entries: SetupEntry[], pathSpecs: string[][]): BestEntryMatch | null {
  const matches: EntryMatch[] = [];
  for (const entry of entries) {
    for (const pathSpec of pathSpecs) {
      const match = scoreEntryAgainstPath(entry, pathSpec);
      if (match) matches.push(match);
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => a.score - b.score);
  const best = matches[0];
  const ambiguousPaths = [...new Set(
    matches
      .filter((candidate) => candidate.score === best.score && candidate.entry.path !== best.entry.path)
      .map((candidate) => candidate.entry.path),
  )];

  return { ...best, ambiguousPaths };
}

function inferConfidence(match: BestEntryMatch): ConfidenceLevel {
  if (match.ambiguousPaths.length > 0) return 'LOW';
  if (match.quality === 'exact') return 'HIGH';
  return 'MEDIUM';
}

function makeParameter(spec: ParameterSpec, match: BestEntryMatch): NormalizedSetupParameter {
  const rawValue = stringifyValue(match.entry.value);
  const parsed = parseDisplayValue(rawValue);
  return {
    parameterKey: spec.parameterKey,
    displayName: spec.displayName,
    group: spec.group,
    axle: spec.axle,
    corner: spec.corner,
    sourcePath: match.entry.path,
    rawValue,
    confidence: inferConfidence(match),
    mappingQuality: match.quality,
    ambiguousMatches: match.ambiguousPaths,
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
  const mappingWarnings: string[] = [];
  const mappingStats: NormalizedSetup['mappingStats'] = {
    exact: 0,
    ordered: 0,
    ambiguous: 0,
  };
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
    mappingStats[match.quality] += 1;
    if (match.ambiguousPaths.length > 0) {
      mappingStats.ambiguous += 1;
      mappingWarnings.push(
        `${spec.displayName} matched "${match.entry.path}" but had ${match.ambiguousPaths.length} equally scored alternative path(s): ${match.ambiguousPaths.join(', ')}.`,
      );
    }
    parameters.push(makeParameter(spec, match));
  }

  parameters.sort((a, b) => a.parameterKey.localeCompare(b.parameterKey));
  return {
    architecture,
    parameters,
    missingKeys,
    unsupportedKeys,
    mappingWarnings,
    mappingStats,
  };
}

export function getNormalizedParameter(
  setup: NormalizedSetup,
  parameterKey: string
): NormalizedSetupParameter | undefined {
  return setup.parameters.find((parameter) => parameter.parameterKey === parameterKey);
}
