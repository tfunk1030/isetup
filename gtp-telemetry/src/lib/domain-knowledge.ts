// ═══════════════════════════════════════════════════════════════
// GTP Domain Knowledge — Encoded from SKILL.md & per-car-quirks.md
// ═══════════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────────

export interface SimConstraint {
  id: string;
  description: string;
  parameter: string;
  limit: number;
  unit: string;
  enforcementType: 'hard-minimum' | 'hard-maximum' | 'setup-only';
  affectedCars: string[] | 'all';
  workaround: string;
}

export interface PhysicsVersion {
  season: string;
  patchDate: string;
  description: string;
  impacts: PhysicsImpact[];
  obsoletesSetupsBefore: boolean;
}

export interface PhysicsImpact {
  system: 'tyres' | 'hybrid' | 'brakes' | 'aero' | 'suspension';
  affectedCars: string[] | 'all';
  description: string;
  setupConversion?: string;
}

export type CornerPhase = 'entry' | 'mid' | 'exit';
export type SpeedRegime = 'low' | 'mid' | 'high';
export type HandlingSymptom = 'understeer' | 'oversteer' | 'instability' | 'traction-loss' | 'bottoming';

export interface DiagnosticRule {
  id: string;
  symptom: HandlingSymptom;
  phase: CornerPhase;
  speedRegime: SpeedRegime | 'any';
  keywords: string[];
  primaryParameters: string[];
  direction: string;
  magnitude: string;
  tradeoff: string;
  verifyChannel: string;
  confidence: 'HIGH' | 'MEDIUM';
}

export interface ImpactLevel {
  rank: number;
  parameterGroup: string;
  description: string;
  parameterKeys: string[];
}

export interface TrackSetupGuidance {
  trackId: string;
  surfaceType: 'smooth' | 'bumpy' | 'mixed' | 'banking';
  wingLevel: 'minimum' | 'low' | 'medium-low' | 'medium' | 'medium-high' | 'high';
  heaveSpringGuidance?: { frontMin_Nmm?: number; rearNotes?: string };
  hsCompSlopeGuidance?: 'digressive' | 'linear' | 'moderate';
  keyCompromise?: string;
  bestCar?: string;
  specialNotes: string[];
}

export interface WetProtocolStep {
  order: number;
  action: string;
  parameterKeys: string[];
  direction: string;
  magnitude: string;
  rationale: string;
}

export interface InCarAdjustmentRule {
  channel: string;
  driftPattern: string;
  interpretation: string;
  setupImplication: string;
  suggestedFix: string;
}

export interface CarDeepKnowledge {
  carId: string;
  character: string;
  brakeBiasBaseline: number;
  naturalRotationRank: number;
  aeroPlatformSensitivityRank: number;
  diffSensitivity: 'very-high' | 'high' | 'medium' | 'low';
  topSpeedRank: number;
  setupEffortRank: number;
  bestCircuitTypes: string[];
  weaknesses: string[];
  uniqueFeatures: string[];
  damperScaleWarning: string;
  referenceSetup?: ReferenceSetupValues;
}

export interface ReferenceSetupValues {
  track: string;
  season: string;
  frontHeaveSpring: string;
  rearThirdSpring: string;
  frontArbSize: string;
  rearArbSize: string;
  brakeBias: string;
  rearWingAngle: string;
  diffPreload: string;
  frontCamber: string;
  rearCamber: string;
  notes: string[];
}

export interface DamperSlopeRule {
  condition: string;
  peakVelocityThreshold: number;
  slopeRecommendation: string;
  rationale: string;
}

// ── Sim Constraints ────────────────────────────────────────────

export const SIM_CONSTRAINTS: SimConstraint[] = [
  {
    id: 'front-rh-floor',
    description: 'Front ride height garage-setup minimum of 30.0 mm (static only — dynamic ride height at speed will compress below 30mm under aero load, which is normal and expected)',
    parameter: 'frontRideHeight',
    limit: 30.0,
    unit: 'mm',
    enforcementType: 'setup-only',
    affectedCars: 'all',
    workaround: 'The 30mm limit only applies to the garage setup screen. During running, the splitter/front RH will drop below 30mm due to aero load and suspension compression — this is not a violation. Address excessive bottoming via heave spring stiffness, HS comp damping, and HS comp slope.',
  },
  {
    id: 'min-cold-pressure',
    description: 'Minimum cold tyre pressure of 152 kPa (22.0 PSI)',
    parameter: 'tyreColdPressure',
    limit: 152,
    unit: 'kPa',
    enforcementType: 'hard-minimum',
    affectedCars: 'all',
    workaround: 'Hot pressures will always overshoot 20-24 PSI target (~25-27 PSI hot). Manage tyre performance via camber, alignment, spring/damper tuning instead.',
  },
];

// ── Physics Versions ───────────────────────────────────────────

export const PHYSICS_VERSIONS: PhysicsVersion[] = [
  {
    season: 'S2_2025',
    patchDate: '2025-03-01',
    description: 'Complete tire compound reconstruction — all earlier setups invalidated',
    impacts: [
      { system: 'tyres', affectedCars: 'all', description: 'Dry grip reduced, wet reworked, heat recalibrated. Out-laps precarious.' },
    ],
    obsoletesSetupsBefore: true,
  },
  {
    season: 'S3_2025_P3',
    patchDate: '2025-06-27',
    description: 'Brake migration bugfix — was running at 50% of stated value',
    impacts: [
      {
        system: 'brakes',
        affectedCars: ['cadillac', 'porsche', 'ferrari'],
        description: 'Brake migration now applies full stated value',
        setupConversion: 'Halve migration setting, add 1-1.25% forward to base brake bias',
      },
      {
        system: 'brakes',
        affectedCars: ['ferrari'],
        description: 'Brake migration newly added to Ferrari 499P',
      },
    ],
    obsoletesSetupsBefore: false,
  },
  {
    season: 'S4_2025',
    patchDate: '2025-09-01',
    description: 'Hybrid system overhaul — ICE + MGU blended to 500 kW cap',
    impacts: [
      { system: 'hybrid', affectedCars: 'all', description: 'Battery SoC locked at 50%, no user-adjustable deployment. Hybrid invisible to driver.' },
      { system: 'hybrid', affectedCars: ['ferrari'], description: 'Front-axle MGU now correctly deploys only above 190 km/h at up to 100 kW.' },
    ],
    obsoletesSetupsBefore: false,
  },
  {
    season: 'S1_2026',
    patchDate: '2026-01-02',
    description: 'Vision tread tires — progressive conditioning, fronts reach 85°C window after 13-15 laps',
    impacts: [
      {
        system: 'tyres',
        affectedCars: 'all',
        description: 'Vision tread: fronts condition at +2.2-2.6°C/lap, rears +2.9-3.5°C/lap. Rears reach 85°C by lap 8-9, fronts by lap 13-15. A 5-lap stint showing cold tyres is NORMAL.',
      },
      {
        system: 'tyres',
        affectedCars: ['ferrari'],
        description: 'Ferrari received most comprehensive update: new tire properties, brake cooling recalibration, rear suspension geometry, 10 kg weight reduction.',
      },
    ],
    obsoletesSetupsBefore: false,
  },
];

export const CURRENT_PHYSICS_SEASON = 'S1_2026';

// ── Impact Hierarchy ───────────────────────────────────────────

export const IMPACT_HIERARCHY: ImpactLevel[] = [
  { rank: 1, parameterGroup: 'heave', description: 'Heave/third spring rates', parameterKeys: ['frontHeaveSpring', 'rearThirdSpring', 'frontHeavePerch', 'rearThirdPerch'] },
  { rank: 2, parameterGroup: 'aero', description: 'Aero trim (wing + ride height)', parameterKeys: ['rearWingAngle', 'frontPushrod', 'rearPushrod', 'frontRideHeight', 'rearRideHeight'] },
  { rank: 3, parameterGroup: 'arb', description: 'Anti-roll bars', parameterKeys: ['frontArbSize', 'rearArbSize', 'frontArbBlades', 'rearArbBlades'] },
  { rank: 4, parameterGroup: 'dampers', description: 'Damper settings', parameterKeys: ['frontLSComp', 'rearLSComp', 'frontHSComp', 'rearHSComp', 'frontHSCompSlope', 'rearHSCompSlope', 'frontLSRbd', 'rearLSRbd', 'frontHSRbd', 'rearHSRbd'] },
  { rank: 5, parameterGroup: 'diff', description: 'Differential', parameterKeys: ['rearDiffPreload', 'frontDiffPreload', 'diffClutchPlates', 'diffRampAngles'] },
  { rank: 6, parameterGroup: 'springs', description: 'Corner springs', parameterKeys: ['frontTorsionBarOD', 'rearSpringRate', 'rearSpringPerch'] },
  { rank: 7, parameterGroup: 'brakes', description: 'Brake setup', parameterKeys: ['brakeBias', 'brakeMigration', 'brakePads'] },
  { rank: 8, parameterGroup: 'alignment', description: 'Camber / toe', parameterKeys: ['frontCamber', 'rearCamber', 'frontToe', 'rearToe'] },
  { rank: 9, parameterGroup: 'pressures', description: 'Tyre pressures', parameterKeys: ['LFcoldPressure', 'RFcoldPressure', 'LRcoldPressure', 'RRcoldPressure'] },
  { rank: 10, parameterGroup: 'gearing', description: 'Gearing', parameterKeys: ['gearStack'] },
];

// ── Diagnostic Rules ───────────────────────────────────────────

export const DIAGNOSTIC_RULES: DiagnosticRule[] = [
  // Entry understeer
  { id: 'entry-us-low', symptom: 'understeer', phase: 'entry', speedRegime: 'low',
    keywords: ['turn-in', 'entry', 'understeer', 'push', 'won\'t rotate', 'plough'],
    primaryParameters: ['frontArbSize', 'frontArbBlades', 'rearDiffPreload', 'brakeBias'],
    direction: 'Soften front ARB or reduce diff preload, shift bias rearward',
    magnitude: '1 ARB blade step, or 5-10 Nm diff preload, or 0.5% bias',
    tradeoff: 'Softer front ARB reduces front roll stiffness — rear may become more nervous mid-corner',
    verifyChannel: 'LFtempL/M/R and RFtempL/M/R — fronts should work harder after change',
    confidence: 'HIGH' },
  { id: 'entry-us-high', symptom: 'understeer', phase: 'entry', speedRegime: 'high',
    keywords: ['high speed', 'entry', 'understeer', 'push', 'aero'],
    primaryParameters: ['rearWingAngle', 'frontPushrod', 'frontHeaveSpring'],
    direction: 'Reduce rear wing or lower front RH (via pushrod offset), stiffen front heave',
    magnitude: '0.5-1° wing reduction, 0.5mm pushrod, or 5-10 N/mm heave',
    tradeoff: 'Less rear wing reduces high-speed rear stability; lower front RH risks bottoming',
    verifyChannel: 'CFSRrideHeight — ensure no splitter bottoming',
    confidence: 'HIGH' },

  // Mid-corner understeer
  { id: 'mid-us-low', symptom: 'understeer', phase: 'mid', speedRegime: 'low',
    keywords: ['mid-corner', 'understeer', 'push', 'steady state', 'apex'],
    primaryParameters: ['frontArbSize', 'frontArbBlades', 'rearArbSize', 'rearArbBlades', 'rearDiffPreload'],
    direction: 'Soften front ARB and/or stiffen rear ARB; reduce diff preload',
    magnitude: '1 ARB size step or 2 blade clicks; 5-10 Nm preload',
    tradeoff: 'Stiffer rear ARB reduces rear mid-corner grip; less diff preload can make entry less stable',
    verifyChannel: 'Tyre temps: front axle should come up, rear should drop slightly',
    confidence: 'HIGH' },
  { id: 'mid-us-high', symptom: 'understeer', phase: 'mid', speedRegime: 'high',
    keywords: ['high speed', 'mid-corner', 'understeer', 'sweeper'],
    primaryParameters: ['rearWingAngle', 'frontPushrod', 'rearThirdSpring'],
    direction: 'Reduce rear wing, lower front RH, or stiffen rear third spring for more rear aero stability',
    magnitude: '0.5° wing, or re-balance pushrod/perch to shift aero balance forward',
    tradeoff: 'Less rear wing = less overall DF, potentially loose at other high-speed points',
    verifyChannel: 'LatAccel peak through high-speed corners',
    confidence: 'HIGH' },

  // Exit understeer
  { id: 'exit-us-any', symptom: 'understeer', phase: 'exit', speedRegime: 'any',
    keywords: ['exit', 'understeer', 'push', 'traction', 'throttle', 'drive'],
    primaryParameters: ['rearDiffPreload', 'rearArbSize', 'rearArbBlades'],
    direction: 'Increase diff preload for more traction, soften rear ARB',
    magnitude: '5-10 Nm preload, 1 ARB blade step',
    tradeoff: 'More diff preload restricts rotation in tight corners; softer rear ARB reduces rear stability mid-corner',
    verifyChannel: 'Rear tyre temps — inside rear should not overheat from diff drag',
    confidence: 'MEDIUM' },

  // Entry oversteer
  { id: 'entry-os-low', symptom: 'oversteer', phase: 'entry', speedRegime: 'low',
    keywords: ['entry', 'oversteer', 'snap', 'loose', 'rotate', 'trail brake'],
    primaryParameters: ['rearDiffPreload', 'brakeBias', 'rearArbSize', 'rearArbBlades'],
    direction: 'Increase diff preload, shift bias forward, stiffen rear ARB',
    magnitude: '5-10 Nm preload, 0.5-1% bias forward, 1 ARB blade step',
    tradeoff: 'More diff preload restricts mid-corner rotation; more forward bias locks fronts earlier',
    verifyChannel: 'dcBrakeBias drift during stint — should stabilize',
    confidence: 'HIGH' },
  { id: 'entry-os-high', symptom: 'oversteer', phase: 'entry', speedRegime: 'high',
    keywords: ['high speed', 'entry', 'oversteer', 'snap', 'braking zone'],
    primaryParameters: ['rearWingAngle', 'rearThirdSpring', 'rearHSComp', 'brakeBias'],
    direction: 'Increase rear wing, stiffen rear third spring, increase rear HS comp',
    magnitude: '0.5-1° wing, 10-20 N/mm third spring, 1-2 clicks HS comp',
    tradeoff: 'More rear wing adds drag; stiffer rear platform may reduce mechanical grip over bumps',
    verifyChannel: 'RRrideHeight and LRrideHeight variance at speed — should decrease',
    confidence: 'HIGH' },

  // Mid-corner oversteer
  { id: 'mid-os-low', symptom: 'oversteer', phase: 'mid', speedRegime: 'low',
    keywords: ['mid-corner', 'oversteer', 'loose', 'snap', 'rotation'],
    primaryParameters: ['rearArbSize', 'rearArbBlades', 'frontArbSize', 'rearDiffPreload'],
    direction: 'Soften rear ARB and/or stiffen front ARB; increase diff preload',
    magnitude: '1 ARB size step or 2 blade clicks; 5-10 Nm preload',
    tradeoff: 'Softer rear ARB reduces overall roll stiffness; more preload adds exit understeer in tight corners',
    verifyChannel: 'Rear tyre temps should equalize axle-to-axle',
    confidence: 'HIGH' },
  { id: 'mid-os-high', symptom: 'oversteer', phase: 'mid', speedRegime: 'high',
    keywords: ['high speed', 'mid-corner', 'oversteer', 'sweeper', 'snap'],
    primaryParameters: ['rearWingAngle', 'rearThirdSpring', 'rearHeavePerch'],
    direction: 'Increase rear wing, stiffen rear third/heave, check rear RH',
    magnitude: '0.5-1° wing, 10-20 N/mm third spring',
    tradeoff: 'More rear wing adds drag; aero balance shift may cause entry understeer',
    verifyChannel: 'RRrideHeight and LRrideHeight at speed — variance should decrease',
    confidence: 'HIGH' },

  // Exit oversteer / traction loss
  { id: 'exit-os-any', symptom: 'oversteer', phase: 'exit', speedRegime: 'any',
    keywords: ['exit', 'oversteer', 'snap', 'wheelspin', 'traction', 'power'],
    primaryParameters: ['rearDiffPreload', 'rearArbSize', 'dcTractionControl'],
    direction: 'Increase diff preload, soften rear ARB, increase TC',
    magnitude: '5-10 Nm preload, 1 ARB step softer, 1-2 TC steps',
    tradeoff: 'More preload reduces mid-corner rotation; higher TC cuts power delivery',
    verifyChannel: 'dcTractionControl — should be stable (not increasing) during stint',
    confidence: 'HIGH' },
  { id: 'exit-traction-any', symptom: 'traction-loss', phase: 'exit', speedRegime: 'any',
    keywords: ['traction', 'wheelspin', 'exit', 'acceleration', 'spinning'],
    primaryParameters: ['rearDiffPreload', 'dcTractionControl', 'rearArbSize'],
    direction: 'Increase diff preload, increase TC, soften rear ARB',
    magnitude: '10-15 Nm preload, 2 TC steps, soften ARB 1 step',
    tradeoff: 'High preload may cause inside rear to drag in tight corners',
    verifyChannel: 'Rear tyre temps — check for asymmetric heating from diff drag',
    confidence: 'HIGH' },

  // Instability
  { id: 'instability-braking', symptom: 'instability', phase: 'entry', speedRegime: 'any',
    keywords: ['unstable', 'braking', 'dancing', 'nervous', 'inconsistent'],
    primaryParameters: ['brakeBias', 'frontLSComp', 'rearLSComp', 'rearDiffPreload'],
    direction: 'Shift bias forward, increase front LS comp, increase diff preload',
    magnitude: '0.5-1% bias, 1-2 clicks LS comp, 5 Nm preload',
    tradeoff: 'More forward bias reduces entry rotation; stiffer front LS comp can skip over bumps',
    verifyChannel: 'Brake channel vs SteeringWheelAngle — corrections should decrease',
    confidence: 'MEDIUM' },
  { id: 'instability-highspeed', symptom: 'instability', phase: 'mid', speedRegime: 'high',
    keywords: ['unstable', 'high speed', 'floaty', 'dancing', 'platform'],
    primaryParameters: ['frontHeaveSpring', 'rearThirdSpring', 'frontHSComp', 'rearHSComp'],
    direction: 'Stiffen heave/third springs, increase HS comp',
    magnitude: '10-20 N/mm heave, 2-3 clicks HS comp',
    tradeoff: 'Stiffer platform may reduce bump compliance on rough tracks',
    verifyChannel: 'RideHeight variance at >200 km/h — should decrease',
    confidence: 'HIGH' },
  { id: 'instability-direction-change', symptom: 'instability', phase: 'mid', speedRegime: 'mid',
    keywords: ['direction change', 'transition', 'chicane', 'esses', 'unstable'],
    primaryParameters: ['frontLSRbd', 'rearLSRbd', 'frontArbBlades', 'rearArbBlades'],
    direction: 'Increase LS rebound to slow weight transfer; balance ARB blades',
    magnitude: '1-2 clicks LS rbd, 1 blade adjustment',
    tradeoff: 'Too much LS rebound delays weight transfer — car feels sluggish in transitions',
    verifyChannel: 'Lateral G build rate through chicanes',
    confidence: 'MEDIUM' },

  // Bottoming
  { id: 'bottoming-front', symptom: 'bottoming', phase: 'mid', speedRegime: 'high',
    keywords: ['bottoming', 'front', 'splitter', 'scraping', 'ride height'],
    primaryParameters: ['frontHeaveSpring', 'frontHSComp', 'frontHSCompSlope'],
    direction: 'Stiffen front heave spring, increase front HS comp, lower HS comp slope for digressive',
    magnitude: '15-25 N/mm heave (Sebring needs ≥65), 2-3 clicks HS comp, 1-2 clicks slope',
    tradeoff: 'Cannot raise front static RH above 30mm in the garage. Dynamic RH below 30mm at speed is normal aero compression — fix excessive bottoming via spring/damper.',
    verifyChannel: 'CFSRrideHeight min value and LFrideHeight/RFrideHeight at speed',
    confidence: 'HIGH' },
  { id: 'bottoming-rear', symptom: 'bottoming', phase: 'mid', speedRegime: 'high',
    keywords: ['bottoming', 'rear', 'ride height'],
    primaryParameters: ['rearThirdSpring', 'rearPushrod', 'rearThirdPerch', 'rearHSComp'],
    direction: 'Stiffen rear third spring, raise rear RH via pushrod/perch offset, increase rear HS comp',
    magnitude: '20-50 N/mm third spring, 1-2mm pushrod less negative, 2-3 clicks HS comp',
    tradeoff: 'Raising rear RH shifts aero balance; stiffer rear platform reduces mechanical compliance',
    verifyChannel: 'LRrideHeight and RRrideHeight min at speed',
    confidence: 'HIGH' },

  // Additional low-speed specific rules
  { id: 'mid-us-mechanical', symptom: 'understeer', phase: 'mid', speedRegime: 'low',
    keywords: ['tight corner', 'hairpin', 'slow', 'understeer', 'mechanical'],
    primaryParameters: ['rearDiffPreload', 'frontArbBlades', 'rearArbBlades', 'frontCamber'],
    direction: 'Reduce diff preload, soften front ARB blade, stiffen rear ARB blade, add front camber',
    magnitude: '5 Nm preload, 1 blade each direction, 0.1-0.2° camber',
    tradeoff: 'Less preload reduces exit traction; more front camber increases inner tyre temp',
    verifyChannel: 'Front tyre O/M/I spread — inner should be warmest',
    confidence: 'MEDIUM' },

  // Tyre-related issues
  { id: 'cold-tyres', symptom: 'instability', phase: 'mid', speedRegime: 'any',
    keywords: ['cold', 'tyre', 'temperature', 'grip', 'no grip', 'conditioning'],
    primaryParameters: ['frontToe', 'frontCamber', 'rearCamber'],
    direction: 'Increase front toe-out and camber for faster heat generation; check if Vision tread conditioning is still progressing',
    magnitude: '0.5mm more toe-out, 0.1-0.2° more camber',
    tradeoff: 'More toe-out increases tyre wear and reduces straight-line stability',
    verifyChannel: 'Surface temps LFtempL/M/R etc — should show progressive warming',
    confidence: 'MEDIUM' },
];

// ── Track Setup Guidance ───────────────────────────────────────

export const TRACK_SETUP_GUIDANCE: Record<string, TrackSetupGuidance> = {
  daytona: {
    trackId: 'daytona',
    surfaceType: 'banking',
    wingLevel: 'minimum',
    heaveSpringGuidance: { rearNotes: 'Stiff heave/third springs for 31° banking compression loads — will bottom car if too soft' },
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'Bus stop chicane vs banking — trail-brake for front grip aero setup can\'t provide',
    bestCar: 'Porsche 963 (highest top speed)',
    specialNotes: ['Higher tyre pressures for sidewall loading in banking', 'Raise ride heights for banking compression', 'Low DF configuration'],
  },
  sebring: {
    trackId: 'sebring',
    surfaceType: 'bumpy',
    wingLevel: 'medium',
    heaveSpringGuidance: { frontMin_Nmm: 65, rearNotes: 'BMW: 530 N/mm rear third verified. Front heave 30 N/mm causes bottoming — need ≥65 N/mm' },
    hsCompSlopeGuidance: 'digressive',
    keyCompromise: 'Bump compliance vs aero platform — concrete/asphalt transitions',
    bestCar: 'BMW M Hybrid V8 (mechanical grip advantage)',
    specialNotes: [
      'Front static RH at 30.0mm garage floor — dynamic RH below 30mm at speed is expected; bottoming addressed via heave spring + HS comp',
      'Expect hot pressures 25-27 PSI from 152 kPa min cold',
      'Track temp ~39°C typical',
      'Lower HS comp slope for digressive damping on bumps',
    ],
  },
  cota: {
    trackId: 'cota',
    surfaceType: 'mixed',
    wingLevel: 'medium-high',
    heaveSpringGuidance: { rearNotes: 'Moderate heave + firm rear third spring for S1 esses direction changes under aero load' },
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'S1 esses need firm heave but elevation changes elsewhere punish over-stiff setups',
    specialNotes: ['Heavy kerbs — stiffen HS comp for kerb strikes', 'Elevation changes create dynamic DF variations at crests'],
  },
  watkins_glen: {
    trackId: 'watkins_glen',
    surfaceType: 'bumpy',
    wingLevel: 'high',
    heaveSpringGuidance: { rearNotes: 'Softer front heave springs (documented requirement, similar to Sebring)' },
    hsCompSlopeGuidance: 'digressive',
    keyCompromise: 'Boot section elevation changes reward proper heave/third spring tuning',
    specialNotes: ['Mid-speed balance is key', 'Camber important', 'Lower HS comp slope for bump absorption'],
  },
  road_atlanta: {
    trackId: 'road_atlanta',
    surfaceType: 'mixed',
    wingLevel: 'medium-high',
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'Aero platform through fast esses vs strong braking setup',
    specialNotes: ['Fast sweepers need stable aero platform', 'Hard braking zones require strong brake setup'],
  },
  road_america: {
    trackId: 'road_america',
    surfaceType: 'smooth',
    wingLevel: 'medium-low',
    hsCompSlopeGuidance: 'linear',
    keyCompromise: 'Lower wing than expected — long straights; stiffer heave is fine on smooth surface',
    specialNotes: ['Can run stiffer heave springs (smooth surface)', 'The Kink requires stable aero platform'],
  },
  spa: {
    trackId: 'spa',
    surfaceType: 'mixed',
    wingLevel: 'medium-high',
    heaveSpringGuidance: { rearNotes: 'Very stiff rear heave for Eau Rouge/Blanchimont platform stability' },
    hsCompSlopeGuidance: 'moderate',
    bestCar: 'Ferrari 499P (excels Pouhon/Blanchimont)',
    keyCompromise: 'HS rebound must allow extension through Raidillon crest. Bus Stop needs compliance.',
    specialNotes: ['Eau Rouge: rear platform critical', 'Blanchimont: sustained high-speed load', 'Bus Stop chicane: need compliance'],
  },
  le_mans: {
    trackId: 'le_mans',
    surfaceType: 'smooth',
    wingLevel: 'minimum',
    heaveSpringGuidance: { rearNotes: 'Stiff rear third spring for Porsche Curves platform consistency' },
    hsCompSlopeGuidance: 'linear',
    bestCar: 'Porsche 963 (highest top speed)',
    keyCompromise: 'Chicane compliance vs straight speed',
    specialNotes: [
      'Long gear stack MANDATORY since S2 2025',
      'Front static RH at 30mm garage minimum = lowest drag config; dynamic RH below 30mm at speed is normal',
      'Ferrari cornering mode valuable through Porsche Curves',
    ],
  },
  indianapolis: {
    trackId: 'indianapolis',
    surfaceType: 'mixed',
    wingLevel: 'medium',
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'Good baseline track — mid-level everything',
    specialNotes: ['Mostly flat with some bumps'],
  },
  laguna_seca: {
    trackId: 'laguna_seca',
    surfaceType: 'mixed',
    wingLevel: 'high',
    hsCompSlopeGuidance: 'moderate',
    bestCar: 'Acura ARX-06 (rotation advantage)',
    keyCompromise: 'Mechanical grip focus — Corkscrew elevation change',
    specialNotes: ['High wing for maximum cornering', 'Heavy braking setup needed', 'Technical circuit rewards sharp front end'],
  },
  monza: {
    trackId: 'monza',
    surfaceType: 'smooth',
    wingLevel: 'low',
    hsCompSlopeGuidance: 'linear',
    keyCompromise: 'Minimize tyre heat in chicanes while maintaining straight speed',
    specialNotes: ['Low drag config', 'Stiffer HS comp slope suits smooth surface', 'Chicanes: minimize scrub'],
  },
  nurburgring_gp: {
    trackId: 'nurburgring_gp',
    surfaceType: 'mixed',
    wingLevel: 'medium-high',
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'Good all-around setup — technical mixed speed',
    specialNotes: ['Technical layout rewards balanced setup'],
  },
  imola: {
    trackId: 'imola',
    surfaceType: 'mixed',
    wingLevel: 'medium',
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'Kerb-heavy with elevation — need compliance + strong braking',
    specialNotes: ['Kerb compliance important', 'Elevation changes', 'Strong braking required'],
  },
  suzuka: {
    trackId: 'suzuka',
    surfaceType: 'smooth',
    wingLevel: 'high',
    hsCompSlopeGuidance: 'moderate',
    keyCompromise: 'Confidence setup — fast flowing corners demand stable aero platform',
    specialNotes: ['Aero platform critical through esses and 130R', 'High commitment corners'],
  },
  bathurst: {
    trackId: 'bathurst',
    surfaceType: 'bumpy',
    wingLevel: 'medium-high',
    hsCompSlopeGuidance: 'digressive',
    keyCompromise: 'Dual-personality: compliant for mountain, stiff for straight',
    specialNotes: ['Very compliant suspension for mountain section', 'Strong heave springs for Conrod Straight', 'Extreme elevation changes'],
  },
};

// ── Wet Protocol ───────────────────────────────────────────────

export const WET_PROTOCOL: WetProtocolStep[] = [
  { order: 1, action: 'Fit wet tyres', parameterKeys: [], direction: 'swap', magnitude: 'N/A', rationale: 'Wet tyres have ~2x tread depth and larger diameter — raises ride heights, re-check aero balance after swap' },
  { order: 2, action: 'Shift brake bias rearward', parameterKeys: ['brakeBias'], direction: 'decrease', magnitude: '2-4%', rationale: 'Fronts lock much more easily on wet surface' },
  { order: 3, action: 'Increase traction control', parameterKeys: ['dcTractionControl', 'dcTractionControl2'], direction: 'increase', magnitude: '2-3 steps', rationale: 'Prevent wheelspin on low-grip surface' },
  { order: 4, action: 'Soften ARBs', parameterKeys: ['frontArbSize', 'rearArbSize', 'frontArbBlades', 'rearArbBlades'], direction: 'soften', magnitude: '1 size step or 2-3 blade clicks', rationale: 'Less roll stiffness helps tyres find grip on low-traction surfaces' },
  { order: 5, action: 'Soften heave/third springs', parameterKeys: ['frontHeaveSpring', 'rearThirdSpring'], direction: 'soften', magnitude: '10-20 N/mm', rationale: 'Aero loads lower in wet (slower speeds), compliance matters more than platform' },
  { order: 6, action: 'Increase ride heights', parameterKeys: ['frontPushrod', 'rearPushrod', 'frontHeavePerch', 'rearThirdPerch'], direction: 'raise', magnitude: '2-3mm via pushrod/perch offsets', rationale: 'Standing water clearance, reduces aquaplaning risk' },
  { order: 7, action: 'Soften HS compression', parameterKeys: ['frontHSComp', 'rearHSComp'], direction: 'decrease', magnitude: '2-3 clicks', rationale: 'Helps tyres maintain contact over water patches' },
  { order: 8, action: 'Add wing angle', parameterKeys: ['rearWingAngle'], direction: 'increase', magnitude: '1-2°', rationale: 'Extra downforce helps in low-grip; straight speed penalty matters less in wet' },
  { order: 9, action: 'Ferrari 499P: leverage front hybrid', parameterKeys: [], direction: 'N/A', magnitude: 'N/A', rationale: 'Front-axle hybrid above 190 km/h provides partial AWD — genuine wet advantage. Cornering mode especially valuable for high-speed wet stability.' },
];

// ── In-Car Adjustment Rules ────────────────────────────────────

export const IN_CAR_ADJUSTMENT_RULES: InCarAdjustmentRule[] = [
  {
    channel: 'dcBrakeBias',
    driftPattern: 'Drifts more than 1% during stint',
    interpretation: 'Base setup bias is wrong for the current fuel window',
    setupImplication: 'Brake bias needs adjustment for the fuel load range in this stint',
    suggestedFix: 'Adjust base brake bias by the average drift amount in the direction it drifts',
  },
  {
    channel: 'dcTractionControl',
    driftPattern: 'Increasing during stint',
    interpretation: 'Rear tyres are overheating — driver adding TC to compensate',
    setupImplication: 'Rear tyre thermal management issue',
    suggestedFix: 'Reduce diff preload, soften rear ARB, or reduce rear camber to lower rear tyre temps',
  },
  {
    channel: 'dcTractionControl',
    driftPattern: 'Consistently at maximum',
    interpretation: 'TC masking a fundamental rear traction deficit',
    setupImplication: 'Setup is too aggressive on rear — diff/ARB/springs need review',
    suggestedFix: 'Increase diff preload, soften rear ARB, increase rear wing if rear is sliding at speed',
  },
  {
    channel: 'dcAntiRollFront',
    driftPattern: 'Blades maxed at minimum (1)',
    interpretation: 'Driver has run out of softening range — needs softer ARB diameter',
    setupImplication: 'Front ARB diameter too stiff for this track/conditions',
    suggestedFix: 'Step down front ARB diameter, set blades to 2-3 for tuning room in both directions',
  },
  {
    channel: 'dcAntiRollFront',
    driftPattern: 'Blades maxed at maximum (5+)',
    interpretation: 'Driver has run out of stiffening range — needs stiffer ARB diameter',
    setupImplication: 'Front ARB diameter too soft for this track/conditions',
    suggestedFix: 'Step up front ARB diameter, set blades to 2-3 for tuning room in both directions',
  },
  {
    channel: 'dcAntiRollRear',
    driftPattern: 'Blades maxed at minimum (1)',
    interpretation: 'Driver has run out of softening range — needs softer rear ARB diameter',
    setupImplication: 'Rear ARB diameter too stiff',
    suggestedFix: 'Step down rear ARB diameter, set blades to 2-3',
  },
  {
    channel: 'dcAntiRollRear',
    driftPattern: 'Blades maxed at maximum (5+)',
    interpretation: 'Driver has run out of stiffening range — needs stiffer rear ARB diameter',
    setupImplication: 'Rear ARB diameter too soft',
    suggestedFix: 'Step up rear ARB diameter, set blades to 2-3',
  },
  {
    channel: 'dcABS',
    driftPattern: 'Constantly adjusted during stint',
    interpretation: 'Brake setup (bias, master cylinder) is wrong for conditions',
    setupImplication: 'Brake configuration needs base adjustment',
    suggestedFix: 'Review brake bias and master cylinder sizes — if ABS keeps going up, bias is wrong direction; if oscillating, master cylinder balance is off',
  },
];

// ── Car Deep Knowledge ─────────────────────────────────────────

export const CAR_DEEP_KNOWLEDGE: Record<string, CarDeepKnowledge> = {
  bmw: {
    carId: 'bmw',
    character: 'Neutral all-rounder, demands most setup iteration per track, snappy on cold tyres, sensitive to rear ARB',
    brakeBiasBaseline: 46.0,
    naturalRotationRank: 3,
    aeroPlatformSensitivityRank: 2,
    diffSensitivity: 'high',
    topSpeedRank: 3,
    setupEffortRank: 1,
    bestCircuitTypes: ['bumpy', 'mechanical-grip', 'all-round'],
    weaknesses: ['Cold tyre snap on out-laps', 'Demands setup work to be competitive', 'Rear ARB one step can swing balance dramatically'],
    uniqueFeatures: ['4.0L Twin-Turbo V8', 'No brake migration', 'Dallara LMDh chassis'],
    damperScaleWarning: 'BMW has relatively low damper click values. Do not transfer to/from Ferrari.',
    referenceSetup: {
      track: 'Sebring', season: 'S1 2026',
      frontHeaveSpring: '30 N/mm (too soft — bottoms, need ≥65)', rearThirdSpring: '530 N/mm',
      frontArbSize: 'Soft', rearArbSize: 'Medium',
      brakeBias: '46.0%', rearWingAngle: '17°', diffPreload: '20 Nm',
      frontCamber: '-2.9°', rearCamber: '-1.9°',
      notes: ['Front platform bottoms with 30 N/mm heave at Sebring', 'RARB blades drifted 1→5 during stint', 'RF peak shock velocity 991 mm/s — slope 9-10 recommended'],
    },
  },
  cadillac: {
    carId: 'cadillac',
    character: 'Best all-rounder, most forgiving, linear NA power, slight understeer bias, excellent endurance weapon',
    brakeBiasBaseline: 48.0,
    naturalRotationRank: 4,
    aeroPlatformSensitivityRank: 3,
    diffSensitivity: 'low',
    topSpeedRank: 2,
    setupEffortRank: 5,
    bestCircuitTypes: ['low-df', 'endurance', 'all-round', 'newcomer-friendly'],
    weaknesses: ['Tyre overheating risk when forcing rotation', 'Not as sharp as Acura in technical sections'],
    uniqueFeatures: ['5.5L NA V8 (only NA in class)', 'Has brake migration', 'Dallara LMDh chassis', 'Most popular for newcomers'],
    damperScaleWarning: 'Dallara chassis — same damper scale as BMW/Acura',
  },
  porsche: {
    carId: 'porsche',
    character: 'Best traction in class, highest top speed low-DF, slow-corner understeer, progressive chassis response',
    brakeBiasBaseline: 48.0,
    naturalRotationRank: 5,
    aeroPlatformSensitivityRank: 1,
    diffSensitivity: 'medium',
    topSpeedRank: 1,
    setupEffortRank: 4,
    bestCircuitTypes: ['low-df-sprint', 'high-speed', 'aero-dependent'],
    weaknesses: ['Inherent slow-corner entry understeer', 'Most aero-platform sensitive — heave spring tuning paramount'],
    uniqueFeatures: ['Multimatic chassis (not Dallara)', 'Has brake migration', 'Most popular GTP car', 'Gentle on tyres'],
    damperScaleWarning: 'Multimatic chassis — different geometry from Dallara. Same value produces different response.',
  },
  acura: {
    carId: 'acura',
    character: 'Sharpest front end in class, snap oversteer prone, diff preload is THE parameter, lowest top speed',
    brakeBiasBaseline: 47.0,
    naturalRotationRank: 1,
    aeroPlatformSensitivityRank: 5,
    diffSensitivity: 'very-high',
    topSpeedRank: 5,
    setupEffortRank: 3,
    bestCircuitTypes: ['technical', 'high-df', 'tight-corners'],
    weaknesses: ['Lowest top speed — poorly suited for Le Mans/Daytona', 'Snap oversteer prone', 'Peaky power from 2.4L V6'],
    uniqueFeatures: ['2.4L Twin-Turbo V6', 'No brake migration', 'Dallara LMDh chassis', 'Highest ceiling at technical tracks'],
    damperScaleWarning: 'Dallara chassis — same damper scale as BMW/Cadillac',
  },
  ferrari: {
    carId: 'ferrari',
    character: 'Strongest mid/high-speed, narrow braking window, front hybrid cornering mode unique, partial AWD >190 km/h in wet',
    brakeBiasBaseline: 56.5,
    naturalRotationRank: 2,
    aeroPlatformSensitivityRank: 4,
    diffSensitivity: 'medium',
    topSpeedRank: 4,
    setupEffortRank: 2,
    bestCircuitTypes: ['medium-high-speed-sweepers', 'wet'],
    weaknesses: ['Narrow optimal braking window — easy to lock fronts/rears', 'Bespoke chassis means unique parameter space'],
    uniqueFeatures: [
      'Bespoke Ferrari LMH chassis (not Dallara)',
      'Has brake migration (added S3 2025)',
      'Front AND rear diff (both adjustable)',
      'HybridRearDriveCornerPct — unique cornering mode',
      'Front-axle MGU provides partial AWD above 190 km/h',
      'Torsion bars rear (not coil springs)',
      'Indexed parameter values (springs, ARBs)',
    ],
    damperScaleWarning: 'Ferrari damper clicks are on a COMPLETELY different scale from Dallara cars. Do NOT transfer values.',
    referenceSetup: {
      track: 'Sebring', season: 'S1 2026',
      frontHeaveSpring: '1 (indexed)', rearThirdSpring: '2 (indexed)',
      frontArbSize: 'A (indexed)', rearArbSize: 'B (indexed)',
      brakeBias: '56.5%', rearWingAngle: '17°', diffPreload: '0 Nm (both front and rear)',
      frontCamber: '-2.9°', rearCamber: '-1.8°',
      notes: ['Indexed values — cannot compare numerically to Dallara cars', 'Front toe -2.0mm (5x more than BMW)', 'Rear dampers much stiffer than front (opposite philosophy from some setups)'],
    },
  },
};

// ── Damper Slope Guidance ──────────────────────────────────────

export const DAMPER_SLOPE_GUIDANCE: DamperSlopeRule[] = [
  {
    condition: 'High peak velocity with linear slope',
    peakVelocityThreshold: 700,
    slopeRecommendation: 'Lower slope by 1-2 clicks for more digressive behavior',
    rationale: 'At >700 mm/s with linear slope, damper over-damps bump events. Digressive slope softens response at extreme velocities while maintaining platform control at normal speeds.',
  },
  {
    condition: 'Moderate peak velocity on smooth surface',
    peakVelocityThreshold: 300,
    slopeRecommendation: 'Maintain or increase slope for linear behavior',
    rationale: 'On smooth circuits, consistent damper force across full velocity range provides better platform control.',
  },
  {
    condition: 'Elevated p95 with very high peaks',
    peakVelocityThreshold: 500,
    slopeRecommendation: 'Moderate digressive (reduce slope by 1 click)',
    rationale: 'p95 > 500 mm/s with peaks well above indicates the damper is working hard across the full range. Moderate digressive provides relief at peaks without losing control.',
  },
];

// ── Helper functions ───────────────────────────────────────────

/** Get the impact hierarchy rank for a parameter key (lower = more impactful).
 *  Accepts both scoped keys (e.g. 'platform.frontHeaveSpring', 'dampers.LF.hsComp')
 *  and unscoped keys (e.g. 'frontHeaveSpring'). */
export function getImpactRank(parameterKey: string): number {
  // Try exact match first
  for (const level of IMPACT_HIERARCHY) {
    if (level.parameterKeys.includes(parameterKey)) {
      return level.rank;
    }
  }
  // Strip scope prefix — take the last segment for keys like 'platform.frontHeaveSpring'
  // or second-to-last + last for corner-scoped keys like 'dampers.LF.hsComp'
  const segments = parameterKey.split('.');
  if (segments.length > 1) {
    const leafKey = segments[segments.length - 1];
    for (const level of IMPACT_HIERARCHY) {
      if (level.parameterKeys.includes(leafKey)) {
        return level.rank;
      }
    }
  }
  // Try mapping normalized keys to hierarchy keys
  const NORMALIZED_TO_HIERARCHY: Record<string, string> = {
    'bias': 'brakeBias',
    'migration': 'brakeMigration',
    'rearWingAngle': 'rearWingAngle',
    'frontPushrod': 'frontPushrod',
    'rearPushrod': 'rearPushrod',
    'frontHeaveSpring': 'frontHeaveSpring',
    'frontHeavePerch': 'frontHeavePerch',
    'rearHeaveSpring': 'rearThirdSpring',
    'rearHeavePerch': 'rearThirdPerch',
    'frontArbSize': 'frontArbSize',
    'frontArbBlades': 'frontArbBlades',
    'rearArbSize': 'rearArbSize',
    'rearArbBlades': 'rearArbBlades',
    'frontToe': 'frontToe',
    'rearToe': 'rearToe',
    'frontCamber': 'frontCamber',
    'rearCamber': 'rearCamber',
    'rearPreload': 'rearDiffPreload',
    'frontPreload': 'frontDiffPreload',
    'hsComp': 'frontHSComp',
    'hsSlope': 'frontHSCompSlope',
    'startingPressure': 'LFcoldPressure',
  };
  if (segments.length > 1) {
    const mapped = NORMALIZED_TO_HIERARCHY[segments[segments.length - 1]];
    if (mapped) {
      for (const level of IMPACT_HIERARCHY) {
        if (level.parameterKeys.includes(mapped)) {
          return level.rank;
        }
      }
    }
  }
  return 99; // Unknown parameter
}

/** Normalize an ID for lookup: replace hyphens with underscores, lowercase */
function normalizeId(id: string): string {
  return id.toLowerCase().replace(/-/g, '_');
}

/** Get track guidance by matching track profile ID.
 *  Handles hyphenated IDs (e.g. 'watkins-glen') by normalizing to underscore keys
 *  (e.g. 'watkins_glen') used in TRACK_SETUP_GUIDANCE. */
export function getTrackGuidance(trackProfileId: string | null): TrackSetupGuidance | null {
  if (!trackProfileId) return null;
  // Direct match
  if (TRACK_SETUP_GUIDANCE[trackProfileId]) return TRACK_SETUP_GUIDANCE[trackProfileId];
  // Normalize hyphens to underscores
  const normalized = normalizeId(trackProfileId);
  if (TRACK_SETUP_GUIDANCE[normalized]) return TRACK_SETUP_GUIDANCE[normalized];
  // Try stripping common suffixes like '-gp' → '_gp' (e.g. 'indianapolis-gp' → 'indianapolis')
  const withoutSuffix = normalized.replace(/_gp$/, '');
  if (TRACK_SETUP_GUIDANCE[withoutSuffix]) return TRACK_SETUP_GUIDANCE[withoutSuffix];
  return null;
}

/** Get car deep knowledge by matching car profile ID.
 *  Handles full model IDs (e.g. 'bmw-m-hybrid-v8') by extracting the short
 *  manufacturer key (e.g. 'bmw') used in CAR_DEEP_KNOWLEDGE. */
export function getCarDeepKnowledge(carProfileId: string | null): CarDeepKnowledge | null {
  if (!carProfileId) return null;
  // Direct match
  if (CAR_DEEP_KNOWLEDGE[carProfileId]) return CAR_DEEP_KNOWLEDGE[carProfileId];
  // Normalize and try
  const normalized = normalizeId(carProfileId);
  if (CAR_DEEP_KNOWLEDGE[normalized]) return CAR_DEEP_KNOWLEDGE[normalized];
  // Extract manufacturer short name from full ID (e.g. 'bmw-m-hybrid-v8' → 'bmw')
  const CAR_ID_TO_SHORT: Record<string, string> = {
    'bmw_m_hybrid_v8': 'bmw',
    'cadillac_v_series_r': 'cadillac',
    'porsche_963': 'porsche',
    'acura_arx_06': 'acura',
    'ferrari_499p': 'ferrari',
  };
  const shortKey = CAR_ID_TO_SHORT[normalized];
  if (shortKey && CAR_DEEP_KNOWLEDGE[shortKey]) return CAR_DEEP_KNOWLEDGE[shortKey];
  // Fallback: try first segment before first hyphen/underscore as manufacturer
  const firstSegment = carProfileId.split(/[-_]/)[0].toLowerCase();
  if (CAR_DEEP_KNOWLEDGE[firstSegment]) return CAR_DEEP_KNOWLEDGE[firstSegment];
  return null;
}

/** Get current physics version note */
export function getPhysicsVersionNote(): string {
  const current = PHYSICS_VERSIONS.find(v => v.season === CURRENT_PHYSICS_SEASON);
  return current ? `${current.season}: ${current.description}` : '';
}

/** Check if Vision tread conditioning applies (S1 2026+) */
export function isVisionTreadActive(): boolean {
  return CURRENT_PHYSICS_SEASON >= 'S1_2026';
}

/** Get diagnostic rules matching a symptom/phase/speed combo */
export function matchDiagnosticRules(
  symptom: HandlingSymptom,
  phase?: CornerPhase,
  speedRegime?: SpeedRegime,
): DiagnosticRule[] {
  return DIAGNOSTIC_RULES.filter(rule => {
    if (rule.symptom !== symptom) return false;
    if (phase && rule.phase !== phase) return false;
    if (speedRegime && rule.speedRegime !== 'any' && rule.speedRegime !== speedRegime) return false;
    return true;
  });
}

/** Get damper slope recommendation based on peak velocity */
export function getDamperSlopeRecommendation(peakVelocity: number, surfaceType?: string): DamperSlopeRule | null {
  if (peakVelocity > 700) return DAMPER_SLOPE_GUIDANCE[0];
  if (peakVelocity < 300 && (surfaceType === 'smooth' || surfaceType === 'banking')) return DAMPER_SLOPE_GUIDANCE[1];
  if (peakVelocity > 500) return DAMPER_SLOPE_GUIDANCE[2];
  return null;
}
