import type {
  CarProfile,
  ConfidenceLevel,
  NormalizedSetup,
  NormalizedSetupParameter,
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

function matchesPath(entry: SetupEntry, pathSpec: string[]): boolean {
  const wanted = pathSpec.map(normalizeToken);
  return wanted.every((part) => entry.segments.some((segment) => segment === part));
}

function findBestEntry(entries: SetupEntry[], pathSpecs: string[][]): SetupEntry | null {
  let best: SetupEntry | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const entry of entries) {
    for (const pathSpec of pathSpecs) {
      if (!matchesPath(entry, pathSpec)) continue;
      const score = entry.segments.length - pathSpec.length;
      if (score < bestScore) {
        best = entry;
        bestScore = score;
      }
    }
  }

  return best;
}

function inferConfidence(entry: SetupEntry): ConfidenceLevel {
  return entry.path.includes('.') ? 'HIGH' : 'MEDIUM';
}

function makeParameter(spec: ParameterSpec, entry: SetupEntry): NormalizedSetupParameter {
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
    confidence: inferConfidence(entry),
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
    const entry = findBestEntry(entries, spec.paths);
    if (!entry) {
      missingKeys.push(spec.parameterKey);
      continue;
    }
    parameters.push(makeParameter(spec, entry));
  }

  parameters.sort((a, b) => a.parameterKey.localeCompare(b.parameterKey));
  return { architecture, parameters, missingKeys, unsupportedKeys };
}

export function getNormalizedParameter(
  setup: NormalizedSetup,
  parameterKey: string
): NormalizedSetupParameter | undefined {
  return setup.parameters.find((parameter) => parameter.parameterKey === parameterKey);
}
