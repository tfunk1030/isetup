# Per-Car Setup Quirks & Parameter Reference — V2 (With Real Data)

This file contains car-specific setup knowledge. Sections marked with **[VERIFIED]** include real parameter values extracted from actual setup files (Sebring International, 2026 Season 1).

## Table of Contents
1. [Critical Architecture Differences](#architecture)
2. [BMW M Hybrid V8](#bmw)
3. [Ferrari 499P](#ferrari)
4. [Cadillac V-Series.R](#cadillac)
5. [Porsche 963](#porsche)
6. [Acura ARX-06](#acura)
7. [Cross-Car Rankings](#rankings)
8. [Track Classification](#tracks)
9. [Wet/Rain Setup](#wet)

---

## Critical Architecture Differences {#architecture}

**This is the most important section in this file.** The five GTP cars use fundamentally different setup UI structures. Parameter names, value types, and even what's adjustable differs between cars. Never assume a parameter from one car maps directly to another.

### LMDh Cars (BMW, Cadillac, Acura) — Dallara Chassis
- **Rear suspension:** Coil springs with `SpringRate` (N/mm) and `SpringPerchOffset` (mm)
- **Rear heave:** Called "Third" — `ThirdSpring` (N/mm), `ThirdPerchOffset` (mm)
- **Dampers organized under:** `CarSetup_Chassis_[Corner]_[DamperParam]`
- **Pushrod param name:** `PushrodLengthOffset`
- **ARB values:** Descriptive labels ("Soft", "Medium", "Stiff") — NOT numeric
- **Brakes/Diff/TC/Gears under:** `CarSetup_BrakesDriveUnit_`
- **Diff:** Preload (Nm) + ClutchFrictionPlates + CoastDriveRampAngles

### Porsche 963 — Multimatic Chassis
- Different suspension geometry from the Dallara cars. Same numeric setup value may produce different response.
- Similar parameter structure to LMDh cars but with Multimatic-specific geometry.

### Ferrari 499P — Bespoke LMH Chassis
- **Rear suspension:** Torsion bars with `TorsionBarOD` (indexed, not mm) and `TorsionBarTurns`
- **Rear heave:** Called "Heave" — `HeaveSpring` (indexed value), `HeavePerchOffset` (mm)
- **Dampers organized under:** `CarSetup_Dampers_[Corner]Damper_[Param]` — separate hierarchy
- **Pushrod param name:** `PushrodLengthDelta` (not "Offset")
- **ARB values:** Letter indices ("A", "B", "C") — NOT descriptive labels
- **Brakes/Diff/TC/Gears under:** `CarSetup_Systems_`
- **Diff:** Has BOTH `FrontDiffSpec_Preload` AND `RearDiffSpec_Preload` + CoastDriveRampOptions + ClutchFrictionPlates
- **Extra hybrid param:** `HybridRearDriveEnabled`, `HybridRearDriveCornerPct`

---

## BMW M Hybrid V8 {#bmw}

**[VERIFIED] Sebring Setup (Garage 61, Season 1 2026)**

### Chassis
| Parameter | Value | Notes |
|-----------|-------|-------|
| Front ride height | 30.1 mm | |
| Rear ride height | 47.8 mm | Rake: 17.7mm |
| Front pushrod offset | -22.5 mm | |
| Rear pushrod offset | -29.0 mm | |
| Front heave spring | 30 N/mm | |
| Front heave perch offset | -13 mm | |
| Rear third spring | 530 N/mm | Much stiffer than front heave |
| Rear third perch offset | 42.5 mm | |
| Front torsion bar OD | 13.9 mm | |
| Rear spring rate | 160 N/mm | Coil spring |
| Rear spring perch offset | 30 mm | |

### ARBs
| Parameter | Value |
|-----------|-------|
| Front ARB size | Soft |
| Front ARB blades | 1 |
| Rear ARB size | Medium |
| Rear ARB blades | 3 |

### Alignment
| Parameter | Value |
|-----------|-------|
| Front camber | -2.9° |
| Rear camber | -1.9° |
| Front toe | -0.4 mm (slight toe-out) |
| Rear toe | 0 mm |

### Dampers (all in clicks)
| Corner | LS Comp | HS Comp | HS Slope | LS Rbd | HS Rbd |
|--------|---------|---------|----------|--------|--------|
| Front | 7 | 5 | 11 | 6 | 8 |
| Rear | 6 | 5 | 11 | 7 | 9 |

Note: BMW has relatively low damper click values compared to Ferrari. The scales are different.

### Brakes, Diff & TC
| Parameter | Value |
|-----------|-------|
| Brake bias | 46.0% |
| Brake pads | Medium |
| Front master cyl | 19.1 mm |
| Rear master cyl | 20.6 mm |
| Diff preload | 20 Nm |
| Diff clutch plates | 4 |
| Diff coast/drive ramp | 40/... |
| TC (TCLON) | 3 |
| TC (TCLAT) | 4 |

### Aero
| Parameter | Value |
|-----------|-------|
| Rear wing angle | 17° |
| Downforce balance | 50.1% |
| L/D ratio | 3.8 |
| Front RH at speed | 15 mm |
| Rear RH at speed | 40 mm |
| Starting pressures | 152 kPa (22.0 PSI) all around |
| Fuel load | 89 L |
| Gear stack | Short |

### BMW-Specific Quirks
- **Cold tyre snap:** Notably worse than other GTP cars on out-laps. The Garage 61 setup runs soft front ARB and modest damping which helps but doesn't eliminate this.
- **Rear ARB sensitivity:** One step in ARB diameter can swing balance dramatically. The verified setup uses "Medium" rear ARB — this is the middle ground. Use blades (3 in this setup) for fine-tuning.
- **Low brake bias (46%):** Much lower than the Ferrari (56.5%). BMW front brakes are aggressive and the car has a tendency to lock fronts, so bias sits further rearward.
- **Rear third spring is massive (530 N/mm):** This keeps the rear aero platform extremely stiff. The front heave at only 30 N/mm is deliberately soft by comparison — this allows the front to breathe over bumps while the rear stays planted.
- **Pressure rise is aggressive:** Starting at 152 kPa (22.0 PSI) cold — the **minimum allowed** — hot pressures reach 181-185 kPa (26.2-26.8 PSI) by lap 4. This is 3-5 PSI over ideal hot window, but **152 kPa is the lowest cold pressure available in iRacing GTP**. Cannot be addressed through pressure alone — manage tyre performance via camber, alignment, and spring/damper tuning instead.
- **Front platform bottoming at Sebring:** With 30 N/mm front heave spring, the front ride heights drop to -1.1 mm (LF) and -4.9 mm (RF) at >200 km/h on Sebring's bumps. Front heave σ=7.66 mm at speed (threshold: <5 mm). **Front static RH sits at the 30.0 mm sim-enforced floor (all GTP cars — 29.9 mm fails setup validation).** Raising front RH sacrifices front aero. Primary bottoming fix: stiffen front heave spring (50 N/mm insufficient at Sebring, try 65-75 N/mm), increase front HS comp damping, adjust HS comp slope. You can also re-balance pushrod offset vs heave perch offset vs torsion bar settings to change preload characteristics while holding 30.0 mm static RH.
- **Rear also bottoms despite stiff third spring:** LR hit -4.6 mm at speed. Rear ride height σ=7.0-7.4 mm. To raise rear ride height ~2mm on rough circuits: adjust rear pushrod length offset (less negative, e.g., -29 → -27 mm) and/or reduce rear third perch offset (e.g., 42.5 → 40 mm for more heave preload). Verify resulting ride height in garage and re-check aero calculator balance.
- **Tyre wear pattern:** Rears wear ~2x faster than fronts (LR 7.8%, RR 6.9% vs LF 4.0%, RF 4.4% after 4 full laps). Monitor diff preload (20 Nm) and rear ARB if rear degradation compounds in long stints.
- **Surface temp asymmetry (track-dependent):** Right-side tyres show 12-13°C inner-outer spread vs 4-6°C on left side at Sebring (right-hand dominant track). Normal for track layout — only address if persistent after pressure correction.
- **[VERIFIED S1 2026] Rear ARB blade drift during stint:** Telemetry showed RARB blades adjusted 1→5 via F8 black box during a 5-lap stint — driver actively searching for rear mechanical balance. When blades max out at 5 on "Medium" ARB diameter, step up to "Stiff" diameter with blades at 2-3 instead. This gives a larger, more consistent roll stiffness step with tuning room in both directions.
- **[VERIFIED S1 2026] Shock velocities at Sebring justify HS comp slope change:** RF peak shock velocity reached 991 mm/s at >200 km/h, rears 682-805 mm/s. At slope=11 (linear), the damper applies full force at these extremes, contributing to bottoming. Slope 9-10 (more digressive) softens response at peak velocities while maintaining platform control at normal shock speeds (p95: 120-182 mm/s).
- **[VERIFIED S1 2026] Vision tread tire conditioning rates at Sebring:** Fronts condition at +2.2-2.6°C/lap, rears at +2.9-3.5°C/lap. At these rates, rears reach 85°C operating window by lap 8-9, fronts by lap 13-15. A 5-lap Offline Testing stint will NOT reach operating temps — this is normal Vision tread conditioning behavior, not a setup failure. For sprint sessions, increase camber and toe-out to accelerate thermal buildup. For endurance, the conditioning model handles it over the first 8-10 laps.
- **No brake migration:** The BMW lacks brake migration (unlike Cadillac, Porsche, Ferrari 499P). Brake bias at 46.0% is straightforward — no S3 2025 migration bugfix conversion needed. Pedal modulation is the only dynamic brake balance lever.

---

## Ferrari 499P {#ferrari}

**[VERIFIED] Sebring Setup (Season 1 2026)**

### Chassis
| Parameter | Value | Notes |
|-----------|-------|-------|
| Front ride height | 30.5 mm | |
| Rear ride height | 48.3 mm | Rake: 17.8mm |
| Front pushrod delta | -2.5 mm | Different param name from BMW |
| Rear pushrod delta | 12.5 mm | |
| Front heave spring | 1 (indexed) | Not a physical value — indexed selection |
| Front heave perch offset | -11.5 mm | |
| Rear heave spring | 2 (indexed) | |
| Rear heave perch offset | -102 mm | Very different scale from front |
| Front torsion bar OD | 3 (indexed) | |
| Front torsion bar turns | 0.103 | |
| Rear torsion bar OD | 8 (indexed) | |
| Rear torsion bar turns | 0.057 | |

### ARBs
| Parameter | Value |
|-----------|-------|
| Front ARB size | A (indexed) |
| Front ARB blades | 1 |
| Rear ARB size | B (indexed) |
| Rear ARB blades | 2 |

### Alignment
| Parameter | Value |
|-----------|-------|
| Front camber | -2.9° |
| Rear camber | -1.8° |
| Front toe | -2.0 mm (aggressive toe-out) |
| Rear toe | 0 mm |

### Dampers (all in clicks — DIFFERENT SCALE from BMW)
| Corner | LS Comp | HS Comp | HS Slope | LS Rbd | HS Rbd |
|--------|---------|---------|----------|--------|--------|
| Front | 15 | 15 | 5 | 25 | 6 |
| Rear | 18 | 40 | 11 | 10 | 40 |

**Note the massive difference from BMW:** Ferrari damper clicks are on a completely different scale. LF LS comp 15 on Ferrari ≠ 15 on BMW. Do not transfer damper values between cars.

### Brakes, Diff & TC
| Parameter | Value |
|-----------|-------|
| Brake bias | 56.5% |
| Brake pads | Medium |
| Front master cyl | 17.8 mm |
| Rear master cyl | 17.8 mm |
| Front diff preload | 0 Nm |
| Rear diff preload | 0 Nm |
| Rear diff clutch plates | 6 |
| Rear diff coast/drive ramp | "Less Locking" |
| TC1 (slip) | 7 |
| TC2 (gain) | 6 |

### Aero
| Parameter | Value |
|-----------|-------|
| Rear wing angle | 17° |
| Downforce balance | 49.0% |
| L/D ratio | 3.86 |
| Front RH at speed | 15 mm |
| Rear RH at speed | 40 mm |
| Starting pressures | 152 kPa (22.0 PSI) all around |
| Fuel load | 89 L |
| Gear stack | Short |

### Ferrari-Specific Quirks
- **Indexed parameter values:** Springs and ARBs use abstract indices (1, 2, A, B) not physical units. You cannot directly compare "Heave Spring 1" on the Ferrari to "30 N/mm" on the BMW. Treat each car's parameter space independently.
- **Front diff preload exists:** Unlike the LMDh cars, the Ferrari has a front differential with adjustable preload. Both front and rear preload are at 0 Nm in this setup — the car runs essentially open diffs. This gives maximum rotation but minimum traction stability.
- **Very high brake bias (56.5%):** 10+ percentage points higher than the BMW. The Ferrari's braking architecture distributes force differently. Do not compare bias numbers between cars — 56% on the Ferrari ≠ 56% on the BMW.
- **Brake migration added S3 2025:** The Ferrari now has brake migration like the Cadillac and Porsche. This was part of the June 2025 brake migration bugfix patch.
- **Aggressive front toe-out (-2.0mm):** Five times more toe-out than the BMW (-0.4mm). The Ferrari wants sharp turn-in. This will also heat the front tyres faster.
- **Rear dampers are MUCH stiffer than front:** HS comp 40 rear vs 15 front, HS rbd 40 rear vs 6 front. This creates an extremely stiff rear platform for aero stability while letting the front move more for mechanical grip — opposite philosophy from making the rear compliant.
- **Cornering mode (added S4 2025 Patch 3):** `HybridRearDriveCornerPct` allows adjusting front hybrid drive amount in high-speed corners. This is effectively a high-speed aero balance tuning tool **unique to the 499P** — no LMDh car has this. Higher values = more front-axle drive in fast corners = more high-speed stability/rotation adjustment.
- **Front-axle hybrid deploys only above 190 km/h** (corrected in S4 2025 hybrid overhaul). Below 190 km/h the car is pure RWD. Above 190 km/h, up to 100 kW from the front MGU provides partial AWD — **genuine advantage in wet conditions**.
- **Vision tread tires + 10 kg weight reduction (S1 2026 Patch 2):** The Ferrari received the most comprehensive BoP update in Jan 2026: new tire properties, brake cooling recalibration, brake pedal force demands, rear suspension geometry adjustments, and a 10 kg weight reduction.
- **Narrow optimal braking window:** The 499P is easy to lock fronts or rears. Aggressive overtaking under braking is risky. This is the car's primary weakness.

---

## Cadillac V-Series.R {#cadillac}

**Dallara LMDh chassis — same architecture as BMW but different character. Consensus best all-rounder in the GTP class.**

No verified setup file available from your data, but the Dallara architecture means parameter names and types match the BMW exactly. Key known differences from community and manufacturer data:

- **Best all-rounder and endurance weapon.** Slight understeer bias, front-biased weight distribution, excellent kerb compliance make it the most forgiving GTP car. Community and Coach Dave Academy consistently rank it as the best overall choice across iRacing's circuit variety.
- **Naturally aspirated 5.5L V8** — the only NA engine in the GTP class. Most linear power delivery, zero turbo lag. Predictable and consistent, especially valuable in endurance.
- **Has brake migration** (like Porsche and Ferrari, unlike BMW and Acura). Adds setup depth but also complexity.
- **Tyre overheating risk** when forcing rotation — if front carcass temps consistently >100°C, add rotation via setup (diff, rear ARB) rather than steering.
- **Diff preload sweet spot** is typically lower than BMW — the car's stability lets you run less preload for more rotation.
- **Recommended for GTP newcomers,** especially those with Dallara LMP2 experience.

---

## Porsche 963 {#porsche}

**Multimatic chassis — NOT Dallara. Different geometry and response curves.**

- **Aero-dominant.** Speed advantage comes from aero platform, not mechanical grip. Heave spring and HS compression settings are paramount.
- **Highest top speed in low-DF trim.** The natural choice for Le Mans and Daytona specification.
- **Best traction and rear-end stability in class.** Compensates for its slow-corner understeer.
- **Multimatic chassis responds more progressively** to spring and damper changes compared to Dallara's more direct response. Same numeric value produces different handling effect.
- **Entry understeer is inherent.** Don't just add front wing — that destabilizes the rear at high speed. Use combination of front pushrod offset adjustment to lower front ride height, softer front ARB, and reduced diff preload. Front ARB blade reduction is the first-line tool.
- **Has brake migration** (like Cadillac and Ferrari, unlike BMW and Acura).
- **Most popular GTP car.** Most community setups available.
- **Gentle on tyres.** Can run more aggressive camber/toe without excessive wear.

---

## Acura ARX-06 {#acura}

**Dallara LMDh chassis — same architecture as BMW/Cadillac.**

- **Diff preload is THE setup parameter.** 1-2 click changes create large handling shifts. More sensitive than any other GTP car. Keep preload low to preserve the car's natural rotation advantage — high preload restricts the defining characteristic.
- **Sharpest front end in class.** Most responsive of any GTP car, requiring minimal steering angle to rotate. Prone to snap oversteer. Tame it with diff preload and softer rear ARB, but preserve the rotation advantage.
- **NO brake migration** (like BMW, unlike Cadillac/Porsche/Ferrari). Requires consistent pedal modulation.
- **Lowest top speed.** On high-speed tracks, forced to run lower wing, which makes the rear setup challenge harder. Poorly suited for Le Mans and Daytona.
- **Highest ceiling at technical tracks.** Excels at high-downforce circuits (Laguna Seca, Barber, tight street circuits) in the hands of experienced drivers.
- **Power delivery** from the 2.4L twin-turbo V6 is peaky and can overwhelm rear grip in slow corners. Smooth throttle inputs are critical.

---

## Cross-Car Rankings {#rankings}

### Competitive Hierarchy (Early 2026)
**No single car dominates** due to active BoP management. Any of the five can win at any track with proper setup and driving. The competitive order shifts season-to-season as BoP is adjusted.

### Natural Rotation (most → least)
1. Acura ARX-06
2. Ferrari 499P
3. BMW M Hybrid V8
4. Cadillac V-Series.R
5. Porsche 963

### Aero Platform Sensitivity (most → least dependent on stable platform)
1. Porsche 963
2. BMW M Hybrid V8
3. Cadillac V-Series.R
4. Ferrari 499P
5. Acura ARX-06

### Diff Sensitivity
1. Acura ARX-06 (diff IS the setup)
2. BMW M Hybrid V8
3. Ferrari 499P
4. Porsche 963
5. Cadillac V-Series.R

### Top Speed (low-DF trim, highest → lowest)
1. Porsche 963
2. Cadillac V-Series.R
3. BMW M Hybrid V8
4. Ferrari 499P
5. Acura ARX-06

### Best Use Case by Circuit Type
- **Low DF / Endurance:** Cadillac V-Series.R (consistency, tyre life, forgiveness)
- **Low DF / Sprint:** Porsche 963 (top speed, traction)
- **High DF / Technical:** Acura ARX-06 (rotation, front-end response)
- **Medium/High Speed Sweepers:** Ferrari 499P (mid/high-speed stability, cornering mode)
- **All-Round / Newcomers:** Cadillac V-Series.R (most forgiving, best all-rounder consensus)
- **Bumpy / Mechanical Grip:** BMW M Hybrid V8 (neutral baseline, rewards setup work)

### Setup Effort Required (most → least iteration needed per track)
1. BMW M Hybrid V8 (neutral but demands setup work to be competitive)
2. Ferrari 499P (bespoke chassis, unique parameter space)
3. Acura ARX-06 (diff sensitivity requires careful tuning)
4. Porsche 963 (progressive, predictable response)
5. Cadillac V-Series.R (most forgiving, closest to "drive off baseline")

---

## Track Classification for GTP {#tracks}

| Track | Type | Key Setup Focus |
|-------|------|----------------|
| Daytona | Low DF, smooth, banking, long straights | Minimum wing, stiff heave/third springs for 31° banking compression loads (will bottom car if too soft), raise ride heights for banking, higher tyre pressures for sidewall loading, bus stop chicane is the key compromise — trail-brake for front grip the aero setup can't provide. Porsche 963 highest top speed here. |
| Sebring | Bumpy, mixed speed, concrete/asphalt transitions | Compliant suspension (softer HS comp, lower HS comp slope for digressive damping), front RH at 30.0mm floor (all GTP cars) so bottoming primarily addressed via heave spring stiffness (≥65 N/mm on BMW) and HS comp damping — front pushrod/perch/torsion bar can be re-balanced while holding 30mm, increase rear ride heights via pushrod/perch offsets for bump clearance, expect elevated hot pressures (152 kPa min cold → 25-27 PSI hot), track temp ~39°C typical. BMW's mechanical grip advantage makes it competitive here. |
| COTA | High-speed + technical, heavy kerbs | Medium-high wing, S1 esses need firm heave springs for rapid direction changes under aero load, but elevation changes elsewhere create dynamic DF variations at crests that punish over-stiff setups. Moderate heave + firm rear third spring. Stiffen HS comp for kerbs. |
| Watkins Glen | Medium-high DF, elevation, bumpy | High wing, **softer front heave springs** (officially documented as requiring softer settings like Sebring), lower HS comp slope for bump absorption, Boot section elevation changes reward proper heave/third spring tuning, focus on mid-speed balance, camber important |
| Road Atlanta | Fast sweepers + hard braking | Aero platform critical through esses, strong braking setup |
| Road America | Long straights + fast corners, smooth | Lower wing than you'd think, can run stiffer heave springs (smooth surface), heave springs important for aero platform through fast kink |
| Spa | High speed, elevation, mixed | Medium-high wing, very stiff rear heave for Eau Rouge/Blanchimont platform. HS rebound must allow suspension to extend through Raidillon crest without unloading wheels. Ferrari 499P excels through Pouhon/Blanchimont. Bus Stop chicane needs compliance. |
| Le Mans | Ultra-low drag, long straights + chicanes | Minimum wing, **Long gear stack MANDATORY since S2 2025**. Front RH at 30mm = minimum drag configuration by default. Stiff rear third spring for Porsche Curves platform consistency. Chicane compliance vs straight speed is the key trade-off. Porsche 963 reaches highest top speed. Ferrari 499P cornering mode valuable through Porsche Curves. |
| Indianapolis GP | Medium speed, mostly flat, some bumps | Mid-level everything, good baseline track |
| Laguna Seca | Technical, elevation change (Corkscrew) | High wing, mechanical grip focus, heavy braking setup. Acura ARX-06 excels here. |
| Monza | Low DF, long straights, few fast corners | Low wing, low drag, stiffer HS comp slope (smooth, linear damping suits this surface), minimize tyre heat in chicanes |
| Nürburgring GP | Technical, mixed speed | Medium-high wing, good all-around setup |
| Imola | Technical, kerb-heavy, elevation | Medium wing, compliant over kerbs, strong braking |
| Suzuka | Fast flowing, high commitment | Aero platform critical, high wing, confidence setup |
| Bathurst | Extreme elevation, bumpy, tight sections | Very compliant for mountain section, strong heave for straight, dual-personality setup |

---

## Wet/Rain Setup Adjustments {#wet}

When rain is declared or `TrackWetness` indicates wet conditions:

### Mandatory Changes
1. **Fit wet tyres immediately.** Wet tyres have ~2x tread depth and larger diameter than slicks. This raises ride heights — re-check aero balance after tyre swap.
2. **Shift brake bias rearward** by 2-4%. Fronts lock much more easily on a wet surface. Cars without ABS need even more rearward bias.
3. **Switch to wet ABS and TC maps** if available. Increase TC intervention.

### Recommended Suspension Changes
- **Soften ARBs** — less roll stiffness helps tyres find grip on low-traction surfaces.
- **Soften heave/third springs** — in the dry, stiff heaves maintain aero platform. In the wet, aero loads are lower (slower speeds), so the platform benefit is reduced and compliance matters more.
- **Increase ride heights** slightly — adjust via pushrod length offsets and heave/spring perch offsets for standing water clearance, reduces aquaplaning risk. Verify resulting ride height in garage.
- **Soften HS compression damping** — helps tyres maintain contact over water patches.

### Tyre Considerations
- Wet tyres overheat rapidly on a drying track. Monitor carcass temps closely — if above 100°C on wets, the track may be dry enough for slicks.
- Wet compound has a lower optimal temperature window than dry compound.
- Wet tyres wear fastest on dry surfaces — the compound is too soft for high-temperature operation.

### TC Map Management
- TC channels: `dcTractionControl` (TC1/TCLON) and `dcTractionControl2` (TC2/TCLAT)
- In the wet, run higher TC values to prevent wheelspin. This is a setup-level decision (garage TC maps) AND a live in-car adjustment.
- **Ferrari at Sebring runs TC1=7, TC2=6 in the dry.** In the wet, increase both by 2-3 steps as a starting point.
- **BMW at Sebring runs TCLON=3, TCLAT=4 in the dry.** Scale up similarly.
- Watch `dcTractionControl` in telemetry — if the driver is constantly increasing TC during the stint, the base setup TC is too low.

### Wet Racing Line
- **Avoid the rubbered dry racing line in wet conditions** — it becomes extremely slippery. Explore alternative lines on cleaner tarmac. This is a driving consideration but directly impacts how the setup's balance manifests — a car that understeers on the dry line may oversteer on a wetter off-line section.

### Ferrari 499P Wet Advantage
- The Ferrari's front-axle hybrid deployment above 190 km/h provides **partial AWD in wet conditions** — a genuine competitive advantage in rain. The cornering mode (`HybridRearDriveCornerPct`) becomes especially valuable for high-speed wet stability. No LMDh car has this capability.
