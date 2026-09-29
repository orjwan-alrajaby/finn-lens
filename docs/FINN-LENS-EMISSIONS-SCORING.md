# Finn Lens — Emissions & Efficiency Scoring

> **Status of this document.** A design record for the Environmental Impact priority as
> rebuilt in commit `7f3e212`, written so another engineer can change it without having to
> re-derive the reasoning. It describes what was actually built and the published evidence
> it rests on. Verified at the time of writing (`7b455be`, 2026-09-05): `npx tsc --noEmit`
> clean, `npx vitest run` green (28 files, 509 tests), 40 of them in `environmental.test.ts`.
>
> `FINN-LENS-HANDOFF.md` §3 summarises this model in a paragraph. This document is the
> long form: why it is the way it is, and what would have to change to change it.
>
> **Amended 2026-09-06.** §12 covers the explanation layer added on top of the model — the
> scoring below is unchanged. Two claims in the copy were corrected at the same time and are
> marked in place: the efficiency benchmark is the combustion fleet average, not "a typical
> petrol car" (§5), and a plug-in hybrid's figure is now labelled for what it is (§6).
>
> **Amended 2026-09-11.** An audit of the efficiency explanation against its sources. The
> scoring, the class ladder, the fit bands, the PHEV treatment and every threshold are
> unchanged. What changed: the consumption benchmark is presented as **Finn Lens's reference**,
> not as what any car "typically" or "on average" uses; `L/100km` is said in words wherever it
> is judged; and two provenance claims were corrected — where 136 g/km is actually published,
> and how 17 kWh/100 km was derived. See §5 "Corrected 2026-09-11", §11 and §12. Verified:
> `npx tsc --noEmit` clean, `npx vitest run` green (35 files, 598 tests). A second pass the
> same day reduced the efficiency sentence to how the car compares with the FINN Lens benchmark,
> and checked every surface it appears on in a real browser — see §5.

---

## 1. Why it was rebuilt

The previous model produced four independent 0–100 sub-scores and averaged them. A reader
saw `CO₂ 49/100 · class 50/100 · consumption 53/100 · fuel type 20/100` and had no way to
interpret any of it.

```
// the shape of the old model
score = mean(
  co2Score,         // 100 × (1 − g/km ÷ 250)
  co2ClassScore,    // A=100 … G=0
  consumptionScore, // 100 × (1 − L or kWh ÷ ceiling)
  powertrainScore,  // Electric 100, PHEV 55, Diesel 20, Petrol 20
)
```

**Three of those four were the same measurement.**

- **The CO₂ class is a pure function of the CO₂ figure.** Since the 2024 Pkw-EnVKV amendment
  the German class is derived from WLTP combined g/km alone.
- **Consumption is the CO₂ figure too**, for anything that burns fuel: CO₂ per km *is*
  litres per km × the carbon in a litre.
- **Fuel type is not a measurement at all.** Scoring it marked a petrol car down twice for
  being petrol — once in its CO₂, once for the fuel that produced that CO₂.

The practical consequence: a user who wanted a petrol car was told *petrol is bad* four
times over, rather than which petrol car was the good one. The arithmetic was false
precision — averaging four numbers, three of which were the same number.

### A separate bug the audit turned up

`lib/translate.ts` had **no entry for `Diesel`** and spelled the hybrid `"Plug-In-Hybrid"`
where FINN sends `"Plug-in Hybrid"`. Both arrived with `fuelType: undefined`.

Blast radius beyond this feature: `energyPriceFor()` in `cost.ts` falls through to the petrol
price for anything not `Electric` or `Diesel`, so **every diesel was costed at petrol
prices**. The PHEV caveat also never fired, for any PHEV. Fixed in the same commit, guarded
by `lib/translate.test.ts`.

---

## 2. What the evidence says

Four findings decided the model. Each is quoted in the header comment of `environmental.ts`
so the reasoning travels with the code; full citations are in §10.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| **Class ≡ CO₂** | Pkw-EnVKV §3a as amended Feb 2024 sets classes on absolute WLTP CO₂: A 0, B ≤95, C ≤115, D ≤135, E ≤155, F ≤175, G ≥176. ADAC on what changed: *"Der Bezug zum Fahrzeuggewicht entfällt."* | Class is displayed, never scored. Before 2024 it was weight-adjusted and did carry extra information; it no longer does. |
| **Consumption ≡ CO₂** | EC real-world monitoring gives petrol's 1.2 L/100 km gap as 28 g CO₂/km — that ratio *is* the 2,330 g of carbon in a litre. Diesel ≈ 2,640 g/L. | Consumption leaves the score entirely and becomes a separate, cohort-relative efficiency answer. |
| **PHEV gap** | ICCT: real-world CO₂ averages ~5× official; the gap grew from 265% (2021) to 400% (2023). Cause is a type-approval utility factor assuming more charging than happens. EC revised it in 2025, again due 2027. | PHEV scale compressed, not corrected. No real-world figure is invented. |
| **Fleet references** | ICCT research brief ID 482 (EEA data): combustion incl. hybrids ≈ 137 g/km WLTP in 2021 → ≈ 134 g/km in 2024; Lens uses 136. ICCT life-cycle report 2025 (Table 4, EEA data): medium-segment BEVs 16.2 kWh/100 km WLTP in 2023; Lens uses a rounded 17. *(Corrected 2026-09-11 — see §5.)* | Every efficiency threshold is derived from these two numbers rather than chosen. |

---

## 3. The model

Three parts. Only one of them scores.

**Environmental Impact.** Tailpipe CO₂ g/km, placed on the EU's own class scale. *This is
the only thing that moves the category score.* The boundaries are the regulation's.

**Efficiency.** A separate, cohort-relative reading of consumption — "frugal *for a petrol
car*". Contributes zero points. It exists because a litre and a kilowatt-hour are not
comparable quantities, and because a petrol buyer needs to know which petrol car is the
frugal one.

**Powertrain.** Context only. Selects the efficiency cohort and carries the caveats.
Contributes zero points.

**CO₂ class.** Displayed beside the figure as its familiar shorthand — and *computed* from
the figure by `co2ClassFor()` rather than read from FINN's field, because a pre-2024 car can
carry a letter that disagrees with its own emissions.

> **The design principle worth keeping.** The two answers are *allowed to disagree*, and
> that disagreement is the product value. A Mercedes EQS SUV is a *strong environmental
> match* and a *less efficient electric car*. A frugal petrol car is *highly efficient* and
> still a worse emitter than any EV. One score cannot hold both; two answers can.

---

## 4. The CO₂ class ladder

Each class occupies a *stretch* of the 0–100 scale, and every stretch sits wholly inside one
of Lens's existing fit bands (`strong ≥65 · good ≥45 · partial ≥25`, from `fit.ts`). So the
class decides the word the reader sees, and the figure decides where within it.

| Class | CO₂ | Score stretch | Fit band |
| --- | --- | --- | --- |
| **A** | 0 g/km | 100 | Strong match |
| **B** | 1 – 95 g/km | 88 → 70 | Strong match |
| **C** | 96 – 115 g/km | 64 → 52 | Good match |
| **D** | 116 – 135 g/km | 44 → 34 | Partial match |
| **E** | 136 – 155 g/km | 33 → 28 | Partial match |
| **F** | 156 – 175 g/km | 22 → 14 | Limited match |
| **G** | 176 g/km and up | 12 → 0 | Limited match |

Class G has no upper bound in law; the scale stops distinguishing at 195 g/km, one
band-width past where G starts.

`positionForCo2()` interpolates within a class, so a 118 g/km car and a 134 g/km car are
both class D and are *not* reported as the same car — while neither can ever outrank a
class C one.

> **The one product judgement in the file.** The class → position table (`CLASS_POSITION`)
> is calibrated so a car of average emissions reads as a **partial match** to someone who
> put the environment near the top of their list. D is the commonest class among cars that
> burn fuel. That is a deliberate call, not an accident — and it is the single table a
> future engineer would tune. Not the thresholds, not the labels.

---

## 5. Efficiency references are derived, not chosen

No threshold in this model was picked by hand. Each powertrain's **reference** falls out of
the ICCT combustion-car CO₂ observation read through the fuel's own carbon content:

```
// cohortFor() — environmental.ts
petrol   136 g/km ÷ 2330 g/L × 100  =  5.84 L/100 km  shown "5.8 L/100km"
diesel   136 g/km ÷ 2640 g/L × 100  =  5.15 L/100 km  shown "5.2 L/100km"
electric (no CO₂ to derive from — every BEV is 0)
                                    =  17 kWh/100 km  rounded reference, see below

// band width: one CO₂ class as a share of the fleet average
EFFICIENCY_BAND = 20 ÷ 136 = 14.7%
```

Using that same proportion for every cohort makes "highly efficient" the same distance from
ordinary whether it is measured in litres or in kilowatt-hours — and it is a width the label
itself already uses rather than one chosen to make cars look good.

### Cohort choice

**Powertrain cohort**, not vehicle class. Vehicle-class cohorts were rejected because FINN's
`cartype` is a free-text field with a single entry in `germanToEnglish` and no values in the
captured detail page — not a benchmark that could be defended. Simplest defensible beat
pretending to a precision the data doesn't support.

### Labels carry their own explanation

`assessEfficiency()` returns the label *and* its explanation together, so no surface
hard-codes the wording:

```ts
{
  level: "moderate",
  label: "Moderate fuel use",
  step: "moderate",
  explanation: "Uses about as much petrol as the FINN Lens benchmark for petrol cars.",
  display: "5.5 L/100km",
  measure: "litres of petrol per 100 km",
  consumes: "This car consumes 5.5 litres of petrol per 100 km",
  reference: "5.8 L/100km",
  referenceLabel: "FINN Lens benchmark",
  referenceNote: "FINN Lens's comparison point, not an official average",
  provenance: { title: "Where does the FINN Lens benchmark come from?", body: "…" },
  caveatTitle: "How this car's figure is measured",
  reasoning: "It uses about 6% less petrol than the 5.8 L/100km FINN Lens benchmark, so " +
             "its fuel use is broadly in line with the benchmark.",
  caveat: "This car's figure comes from WLTP, the standardised test …",
}
```

Vocabulary is five steps with what the car uses named: `Very low` / `Low` / `Moderate` / `High` /
`Very high` `fuel use` (or `electricity use`), coloured green, green, yellow, orange, red. See
§12, "Fuel-use labels". No "weakly" or "poorly".

### Corrected 2026-09-06 — what the benchmark actually is

The explanation used to read "a typical new petrol car" / "a typical new diesel car". That
overstated what the reference is. The figure it compares against is the **combustion fleet's
CO₂ average converted through this fuel's carbon content** — 136 g/km read through 2 330 g/L
or 2 640 g/L. No whole-market petrol-only or diesel-only WLTP consumption average is published
by the sources this was built on, so there was no "typical petrol car" behind the number.

The litre thresholds still differ between the two (5.8 vs 5.15 L/100 km) precisely because a
litre of diesel carries more carbon — which is a true and useful thing to tell a reader, and
what the copy now says.

### Corrected 2026-09-11 — a reference, not an average

The 09-06 fix swapped "a typical petrol car" for "the average new car that burns fuel". That
was still a population claim, and a self-contradicting one: the same "average car" was said to
use 5.8 L/100km in a petrol car's panel and 5.2 in a diesel's. Neither was measured on any car.
The usage sections labelled the figure **Typical for its kind**, the efficiency chip said it
"puts a typical diesel car at 5.2 L/100km", the prose said "around typical" and "more than most
electric cars", and the WLTP caveat said "both figures are official WLTP lab results" — the
reference is not a test result for any car.

What the reader now meets, in order:

| Question | Shown as |
| --- | --- |
| What does it use? | `This car · 5.5 L/100km · This car consumes 5.5 litres of petrol per 100 km` |
| Is that efficient? | `Moderate fuel use`, in yellow, and "It uses about 6% less petrol than the 5.8 L/100km FINN Lens benchmark, so its fuel use is broadly in line with the benchmark." |
| Compared with what? | `FINN Lens benchmark · 5.8 L/100km · FINN Lens's comparison point, not an official average` — drawn quieter than the car's own figure |
| What does the number mean? | An "i" beside the car's own value, headed "What does this number mean?": "L/100km means litres per 100 kilometres. 5.5 L/100km means this car uses about 5.5 litres of petrol to drive 100 km. Lower means less fuel to buy. This car's figure comes from the official EU test, so you can compare cars fairly. Real-world fuel use is usually higher, especially on the motorway, in cold weather or with a full car." One explanation about one number. Electric cars get kWh explained as the unit on an electricity bill. |
| Where is that from? | An "i" beside the reference value, headed "Where does the FINN Lens benchmark come from?": about 136 g of CO₂ per km as a comparison point, from European data on new petrol and diesel cars analysed by the ICCT; not a legal limit or target; converted into an equivalent petrol-use figure, which is where 5.8 L/100km comes from; "a FINN Lens comparison benchmark, not an official petrol-consumption average". Diesel adds why its figure is lower. The environmental result's question uses the same text. |
| What's the catch? | The full version is in the "i" above; the section closes on the short line `TEST_DISCLAIMER`: "Official EU test figures. Real-world use is usually higher." |

**Second pass, 2026-09-11.** The sentence under the label no longer grades the car a second
time ("too close to call it especially frugal", "genuinely frugal", "you pay for it every
month"). It says how the car compares and stops: "…so its fuel use is broadly in line with /
noticeably lower than / noticeably higher than the benchmark." The label carries the verdict,
and the band edges stay unstated. The caveat no longer says the reference is "built from WLTP
figures". Checked in Chromium against the built extension — pins drawer, Advice page and its
export rendering, and the in-page panel on finn.com, at 1280 px and 390 px — which led to two
small layout changes: the reference value is drawn quieter than the car's own figure, and the
opened provenance is ruled off from the caveat beneath it.

**Each explanation on its own figure.** Both explanations then moved out from under the
conclusion, where a reader couldn't tell which number either one was about. The WLTP caveat is
now an "i" beside the car's figure, and the provenance is an "i" beside the reference. Each is
headed with the question it answers. On the pins drawer and the Advice page it is the shared
`Tip` (hover, pin on click, arrow pointing at the number), via `components/FigureInfo.tsx`; an
exported file lays the text flat under its figure. The in-page panel opens it directly under its
number (`figureInfo()` in `sections.ts`). `panel-copy.test.ts` pins that each explanation is
attached to its own figure and appears only once.

`EfficiencyAssessment.typical` / `typicalValue` became `reference` / `referenceValue`, with
`measure`, `referenceLabel`, `referenceNote` and `provenance` beside them, so no renderer
composes — or `.replace()`s its way to — the wording. `components/ReferenceSource.tsx` and
`referenceSource()` in `lens-panel/sections.ts` render the fold.

**Plain-language pass, 2026-09-11.** Brought in line with the environmental result's rule
(§12): no reader should have to know car terminology to follow the explanation. The car's "i"
now explains the unit rather than the test; the provenance drops "combustion cars", "carbon
content" and kilograms per litre (the conversion constants stay in `CARBON_PER_LITRE` and in
this document); and the test disclaimer, true of every figure in the section, moved out from
behind one number's "i" to a single line under the conclusion. `EfficiencyAssessment.caveat` /
`caveatTitle` became `meaning: { title, body }` and `disclaimer`. A follow-up merged the unit
explanation and the test caveat into one `meaning.body` behind the car's "i", and shortened the
closing line to `TEST_DISCLAIMER` ("Official EU test figures. Real-world use is usually
higher."). The environmental result reuses the car's "i" as is, and puts
`referenceDerivation` behind its reference's "i": how the reference is reached, in plain words,
without repeating where 136 g/km comes from (§12).

**Why not a petrol-only or diesel-only average instead.** One exists for a slice of the market:
ICCT's 2025 life-cycle report gives sales-weighted WLTP figures for *medium-segment* cars sold
in 2023 — petrol 5.7, diesel 4.9 L/100 km. Close to the petrol reference; below the diesel one,
so the diesel reference is the more lenient of the two. Not adopted: they describe one segment,
FINN's `cartype` can't place a car in one (see *Cohort choice*), and the derived reference has a
property they lack — petrol and diesel are held to the same CO₂ observation, each in its own
unit.

**Why 136 and not 134.** ICCT brief ID 482 puts combustion cars at about 137 g/km in 2021 and
about 134 in 2024 ("only declined by 3 g/km since 2021"). 136 sits on that plateau and "about
136" stays true. Moving to 134 changes no score (scores come from the class), still shows 5.8
for petrol, shows 5.1 rather than 5.2 for diesel, and moves every band edge by under 0.1 L/100 km
(petrol "highly efficient" ≤ 4.98 → ≤ 4.89; diesel ≤ 4.39 → ≤ 4.32). A one-constant change for
the next data refresh. The Pocketbook's 108 g/km is the all-car average, electric included, and
was never the source of 136.

**Where 17 kWh/100 km comes from.** It was documented as "real-world ≈ 19 kWh running ~12% above
type-approval". The cited battery-size report says neither: its simulated real-world consumption
runs 29–44% above type-approval, and its 12% is an on-board charger loss parameter (Appendix D).
The number stands on better evidence — ICCT's life-cycle report puts medium-segment BEVs at
16.2 kWh/100 km WLTP (2023, EEA data) — and the copy now calls it a rounded reference rather than
"what new electric cars average".

---

## 6. Plug-in hybrids — compressed, not corrected

A PHEV's official CO₂ can be 26 g/km, which on the ladder would sit in class B and read as a
strong match. The ICCT evidence says real emissions run several times higher where the car is
charged less than the test assumes — and that the size of the gap depends on a driver FINN's
data cannot see.

So **nothing is invented**. The figure shown is still FINN's own. What is refused is the top
of the scale:

```ts
if (score != null && fuel === "Plug-in Hybrid") {
  confidence = "optimistic";
  score = Math.round(score * (CLASS_POSITION.C.to / 100));
}
```

**Why compressed rather than clipped.** The first implementation *clipped* at a ceiling. That
made a 26 g/km PHEV and a 75 g/km PHEV come out identical — throwing away the one distinction
the data genuinely supports. Scaling the whole range keeps PHEVs ordered against each other
while keeping all of them below cars whose figures don't need this caveat.

PHEVs also get **no efficiency label**. FINN publishes one weighted figure blending two
energy sources and no separate kWh reading, so there is no cohort it can honestly be placed
in. The UI says so explicitly rather than showing a grade.

---

## 7. Missing data

| What's absent | Score | Behaviour |
| --- | --- | --- |
| CO₂ only | `null` | Efficiency still reported. Band reads "Not enough data". `missing` names the CO₂ figure. |
| Consumption only | scored | Score stands on CO₂. No efficiency label — a missing consumption is *never* read as a frugal one. |
| Powertrain only | scored | Score stands. No cohort, so no efficiency label and no powertrain caveats. |
| CO₂ **and** consumption | — | `assessEnvironment()` returns `null`. The priority reports itself as unanswerable rather than guessing. |

Nothing is ever treated as zero. A 0 g/km reading from an electric car is a *measurement*; an
absent field is an absence, and the two are kept apart throughout.


### Fixed 2026-09-11 — an empty figure is missing, not zero

FINN's API sends `null` for a figure it doesn't have, and the model read figures with
`Number()`. `Number(null)` is `0`, so a car with no published CO₂ was read as a car that emits
none: Class A, "Very low emissions", and a strong environmental match, all on no data. FINN's own
`co2_class` was never the source of the letter (the class is computed from the figure), so the
letter was invented too.

Figures are now read through `published()` in `environmental.ts`: a number stays a number, a
non-empty string is parsed, and `null`, `undefined` and `""` are `NaN`, which the model already
treats as missing. A genuine `0` (an electric car) is still `0`. Consumption is read the same way.

With no CO₂ figure the priority is unscored and reads *Not enough data*, as before. What changed is
what the reader is told:

| Where | Says |
| --- | --- |
| Priority header | "No CO₂ figure published" (it used to fall through to "Equipment not listed by FINN") |
| Answer | "FINN doesn't publish this car's CO₂ figure or its CO₂ class." Consumption is not mentioned here, published or not: "How much it uses" says that in its own section |
| Class pill | *Class not published*, neutral, with an "i": the class comes from the CO₂ number, FINN doesn't publish it, so there's no class and FINN Lens won't guess one |
| CO₂ row | *No data* · "Not published by FINN" |
| Fuel use | not in this section (see "How much it uses is its own section" below) |

To make that possible, `categoryDetail` now carries the environmental reading even when there is no
CO₂ figure to score, and the three renderers draw the environmental block for the environmental
priority whatever the data, rather than only when there is an assessment. The generic "FINN's data
doesn't carry anything we can judge" line is not shown under it.

The category's internal score for an unscored priority is unchanged: like every other priority
without evidence, it takes the engine's neutral 50 in the weighted total, so a missing figure
neither lifts nor sinks a car in the ranking. It is never shown.

The reference is not a property of the car, so it is never missing with the car's figure.
`efficiencyReferenceFor(fuel)` gives it on its own, and `assessEnvironmentOrGaps` keeps what the car
runs on when FINN publishes neither figure (`assessEnvironment` still returns null there, for its
other callers). The only rows without a figure in the reference column are a plug-in hybrid's
("None · Nothing fair to compare with", on purpose) and a car whose fuel FINN doesn't name ("Depends
on the fuel").

### Numbers

Every number is written the English way: a dot for decimals and a comma for thousands, "5.8
L/100km", "16.2 kWh/100km", "1,000 km", "€1,029". `format.ts` formats with `en-GB`; it used
`de-DE`, which wrote "5,8" and "1.000 km" inside English sentences.

---

## 8. Code contract

### Exported surface — `lib/reasoning-engine/environmental.ts`

```ts
assessEnvironment(vehicle: FinnCar): EnvironmentalAssessment | null
assessEfficiency(vehicle: FinnCar): EfficiencyAssessment | null
describeEnvironment(assessment): string       // the reader-facing sentence
co2ClassFor(gPerKm: number): string           // "A" … "G"
positionForCo2(gPerKm: number): number        // 0–100
ENVIRONMENTAL_METHOD: EnvironmentalMethodNote[]  // the collapsed explainer

type EnvironmentalAssessment = {
  score: number | null            // the only thing feeding the engine
  co2: EmissionsAssessment | null
  efficiency: EfficiencyAssessment | null
  powertrain: FuelType | null
  confidence: "measured" | "optimistic" | "unknown"
  caveats: string[]
  missing: string[]
}

// Added 2026-09-06. The figure no longer travels without its meaning.
type EmissionsAssessment = {
  level: "none" | "low" | "moderate" | "high"
  label: string        // "Above-average emissions"
  explanation: string  // what the figure means, in one sentence
  display: string      // "140 g/km · Class E"
  gPerKm: number
  className: string
}
```

### How it reaches the rest of the engine

```
scoring.ts    numericScore("environmental") → assessment.score
              CategoryDetail.environmental  carries the assessment
index.ts      priorityBreakdown()           → PriorityBreakdown.environmental
fit.ts        toFitPriority()               → FitPriority.impact
UI            reads priority.impact / reasoning.environmental
              → components/EnvironmentalResult (React)
              → lens-panel/sections.ts impactBreakdown() (hand-rolled DOM)
```

The category score flows through the existing priority-weighting system untouched — no
environmental multiplier bypasses it, and the priority remains a preference rather than a
hard constraint.

### Files changed in `7f3e212`

| File | Change |
| --- | --- |
| `lib/reasoning-engine/environmental.ts` | Rewritten. The model. |
| `lib/reasoning-engine/environmental.test.ts` | Rewritten. 40 tests. |
| `lib/reasoning-engine/scoring.ts` | `numericScore` environmental branch; `CategoryDetail.environmental`. |
| `lib/reasoning-engine/types.ts` | Assessment type threaded through `CategoryDetail` / `PriorityBreakdown`. |
| `lib/reasoning-engine/fit.ts` | `FitPriority.impact` retyped. |
| `lib/reasoning-engine/narrative/priority.ts` | Prose now comes from `describeEnvironment()`. |
| `entrypoints/content/lens-panel/sections.ts` | Panel section: three readouts, collapsed methodology. |
| `components/EnvironmentalMethod.tsx` | Settings / step-3 explainer rewritten. |
| `lib/translate.ts` | **Bug fix.** Added `Diesel`; fixed PHEV spelling; kept variants. |
| `lib/translate.test.ts` | New. Guards every fuel the API declares. |

Since then the panel has been refactored into `components/FitAnalysisView`, which consumes
the same `priority.impact` contract unchanged.

---

## 9. Sanity results

Eighteen cars run through `assessEnvironment()` and `buildFitAnalysis()`. The rows that
matter are the ones where the two answers diverge.

| Car | Powertrain | CO₂ | Score | Band | Efficiency |
| --- | --- | ---: | ---: | --- | --- |
| Dacia Spring | Electric | 0 · A | 100 | Strong | Low electricity use · 13.9 kWh |
| Tesla Model 3 | Electric | 0 · A | 100 | Strong | Low electricity use · 13.2 kWh |
| BYD Dolphin Surf | Electric | 0 · A | 100 | Strong | Moderate electricity use · 15.9 kWh |
| Mercedes EQS SUV | Electric | 0 · A | 100 | Strong | Very high electricity use · 22.4 kWh |
| Toyota Yaris | Petrol | 102 · C | 60 | Good | Low fuel use · 4.4 L |
| VW Polo | Petrol | 119 · D | 42 | Partial | Moderate fuel use · 5.2 L |
| Jeep Compass | Petrol | 127 · D | 38 | Partial | Moderate fuel use · 5.6 L |
| VW Golf GTI | Petrol | 168 · F | 17 | Limited | High fuel use · 7.4 L |
| Ford Mustang 5.0 | Petrol | 270 · G | 0 | Limited | Very high fuel use · 11.6 L |
| Škoda Octavia TDI | Diesel | 112 · C | 54 | Good | Low fuel use · 4.2 L |
| BMW 320d | Diesel | 128 · D | 38 | Partial | Moderate fuel use · 4.9 L |
| VW Touareg V6 TDI | Diesel | 199 · G | 0 | Limited | Very high fuel use · 7.6 L |
| Mercedes A250e | Plug-in hybrid | 26 · B | 43 | Partial | — not graded |
| Range Rover PHEV | Plug-in hybrid | 75 · B | 38 | Partial | — not graded |
| Petrol, no CO₂ | Petrol | — | — | Not enough data | Moderate fuel use · 5.1 L |
| Petrol, no consumption | Petrol | 142 · E | 31 | Partial | — not graded |
| EV, no consumption | Electric | 0 · A | 100 | Strong | — not graded |

**What to read in it**

- **EQS SUV** — strong match, *less efficient*. The design working: zero tailpipe CO₂ and a
  thirsty EV are both true.
- **Yaris vs Mustang** — 60 vs 0. Efficient petrol beats inefficient petrol, within the same
  powertrain.
- **Octavia vs Touareg** — 54 vs 0. Same, within diesel.
- **A250e vs Range Rover** — 43 vs 38. PHEVs stay ordered against each other and both stay
  below every BEV.
- **Petrol at 120 vs diesel at 120** — identical scores. No double penalty for what a car
  burns.

---

## 10. Limits and follow-ups

- **No size adjustment.** A large efficient EV and a small thirsty one are judged on the same
  scale. Honest for CO₂; arguably harsh for efficiency. Fixing it needs a vehicle-class
  cohort, which needs `cartype` to become reliable data.
- **Full hybrids are invisible.** `FinnApiConfig.fuel` is a closed union of four, so a mild-
  or full-hybrid petrol arrives as plain petrol. Its lower CO₂ figure still scores correctly
  — but it can't be named as a hybrid, and it is judged against the petrol cohort.
- **Fleet references will drift.** `COMBUSTION_FLEET_CO2` (136; ICCT's latest is ≈ 134 for
  2024) and `ELECTRIC_FLEET_KWH` (17; ICCT's medium-segment 2023 figure is 16.2). Both are
  single named constants with their source in the docstring, and every sentence that quotes
  them is built from the constant; expect to revisit them annually.
- **The class → position table is tunable.** If the product wants average-emitting cars to
  read better or worse, `CLASS_POSITION` is the one place to change.
- **PHEV utility factors are moving.** The EC revised them in 2025 with another change due
  2027. When FINN's figures reflect the new factors the compression may need loosening;
  `confidence: "optimistic"` is the flag to search for.

---

## 11. Sources

Primary regulation and institutional research only. No blogs, no SEO sites, no
general-interest car press.

- **Pkw-Energieverbrauchskennzeichnungsverordnung (Pkw-EnVKV)** —
  <https://www.gesetze-im-internet.de/pkw-envkv/BJNR103700004.html>
  §3a: the A–G CO₂ class boundaries the ladder is built on.

- **ADAC — Effizienzklasse Pkw: Neues CO₂-Label ist realistischer** —
  <https://www.adac.de/rund-ums-fahrzeug/auto-kaufen-verkaufen/neuwagenkauf/co2-label-pkw-effizienzklassen/>
  Confirms the 2024 amendment dropped the vehicle-weight reference — the finding that makes
  class and figure redundant.

- **European Commission — Real-world CO₂ emissions and fuel consumption of cars and vans
  (2022 data)** —
  <https://climate.ec.europa.eu/news-other-reads/news/publication-real-world-co2-emissions-and-fuel-consumption-cars-and-vans-collected-2022-2024-07-26_en>
  On-board monitoring. Source of the petrol carbon factor and the WLTP-to-real-world gaps.

- **ICCT — Plug-in hybrids in Europe emit five times more than officially reported** —
  <https://theicct.org/pr-plug-in-hybrids-europe-emit-five-times-more-than-officially-reported/>
  The PHEV utility-factor gap: 265% (2021) → 400% (2023). Basis for the compression.

- **ICCT — CO₂ emissions from new passenger cars in Europe: Car manufacturers' performance in
  2024** (research brief ID 482, December 2025) —
  <https://theicct.org/wp-content/uploads/2025/12/ID-482-%E2%80%93-EEA-briefing-Research-Brief-A4-70179-v7.pdf>
  "The WLTP CO₂ emissions of ICEVs, including hybrid vehicles, have only declined by 3 g/km
  since 2021, remaining at about 134 g/km." The observation behind `COMBUSTION_FLEET_CO2`, and
  so the root of the petrol and diesel references.

- **ICCT — European Vehicle Market Statistics Pocketbook 2025/26** —
  <https://theicct.org/publication/european-vehicle-market-statistics-2025-dec25/>
  Context only: 108 g/km for *all* new cars in 2024, electric included. *(Corrected
  2026-09-11: previously cited as the source of 136 g/km, which it does not state.)*

- **ICCT — Life-cycle greenhouse gas emissions from passenger cars in the European Union: a
  2025 update** —
  <https://theicct.org/wp-content/uploads/2025/07/ID-392-%E2%80%93-Life-cycle-GHG_report_final.pdf>
  Table 4 (EEA data): sales-weighted WLTP consumption of medium-segment cars sold in 2023 —
  petrol 5.7 L, diesel 4.9 L, BEV 16.2 kWh per 100 km. The basis for the 17 kWh/100 km
  reference; the petrol and diesel figures are recorded in §5 and deliberately not used.

- **ICCT — The bigger the better? How battery size affects real-world consumption** —
  <https://theicct.org/wp-content/uploads/2024/04/ID-80-%E2%80%93-BEVs-size-Report-A4-70138-v9.pdf>
  Simulated real-world BEV consumption 29–44% above type-approval — support for the real-world
  caveat. *(Corrected 2026-09-11: previously cited as "≈ 19 kWh/100 km at ~12% above
  type-approval"; the 12% in it is an on-board charger loss parameter.)*

Every source above is also cited in the header comment of
`lib/reasoning-engine/environmental.ts`, so the reasoning travels with the code rather than
living only in this document. The constants each carry their own provenance in a docstring.

---

## 12. The explanation layer

> Added 2026-09-06. The scoring model above is untouched. What changed is the order the
> reader meets it in, and what each number arrives carrying.
>
> **Rebuilt 2026-09-11** for a reader who knows nothing about cars — see the first subsection
> below. The chips and the emissions-versus-efficiency aside described further down are
> retired; those subsections are kept as the record of why they existed.

### The problem

The model was defensible and the presentation was not. Every surface opened on how the
judgement is made — six method cards, expanded — and closed on what the car actually is. The
figures underneath were bare: `CO₂ emissions 140 g/km`, `Consumption 5.4 L/100km`, with
nothing to say whether either was good, bad, or ordinary. A reader who doesn't already know
what 140 g/km means learned nothing from being shown it.

Three surfaces rendered the same assessment at three different levels of completeness, and
one of them had silently lost most of it:

| Surface | Before |
| --- | --- |
| Advice — `compare/advice/components/PrioritySection.tsx` | Sentence + generic measurement table. No class, no efficiency label, no caveat. |
| In-page drawer — `content/lens-panel/sections.ts` | Everything, in the wrong order, methodology first and expanded. |
| Pins drawer — `components/FitAnalysisView` | **One sentence.** Figures, caveats and methodology dropped entirely. |

### Rebuilt 2026-09-11 — for a reader who knows nothing about cars

> Copy and layout only. The CO₂-only score, the class mapping, the bands, every reference
> (136 g/km, 5.8 / 5.2 L/100km, 17 kWh/100km), the plug-in hybrid compression and the
> missing-data behaviour are exactly as §3–§7 describe.

**The rule.** Explain it the way a friend who knows cars would: short, in plain words, answer
first. No percentages ("1% above reference" tells a reader nothing), no FAQ list, nothing folded
away except the "i"s on the numbers a reader might wonder about.

**One source of words.** `lib/environment-copy.ts` → `readEnvironment(assessment, band)` returns
`{ headline, rating, band, summary, note, rows, source }`. `components/EnvironmentalResult.tsx`
(Advice page, pins drawer) and `impactBreakdown()` in `lens-panel/sections.ts` (in-page panel)
only lay it out. It decides nothing: the band is the engine's.

```
126 g/km  [Partial match]                         number and band chip: Advice only
This car produces 126 g of CO₂ for every kilometre you drive. That's about 7% below the FINN
Lens comparison point for petrol and diesel cars. It's not low enough for more than a partial
match for your environmental priority.
[About plug-in hybrids]                           plug-in hybrids only

┌ MEASURE            │ THIS CAR                           │ FINN LENS BENCHMARK
├ CO₂ while driving  │ 126 g/km  (Moderate emissions)     │ 136 g/km ⓘ
│   [Class D ⓘ]      │                                    │
│ This decides the   │ 126 grams of CO₂ per km            │ Average new petrol or diesel car
│ match.             │                                    │
└ Official EU test figures. Real-world use is usually higher.
A petrol car's CO₂ comes from the fuel it burns, so its fuel use goes up and down with this
result. See how much fuel it uses.   ← "how much fuel it uses" links to that section
                                                  petrol and diesel cars with a CO₂ figure only
```

**How much it uses is its own section (2026-09-13).** The environmental result used to carry a
second, fuel-use row, and "How much it uses" stood down on the pinned card and in the in-page panel
whenever the environment was ranked. So where a car's consumption appeared depended on the reader's
setup. Now the environmental table carries CO₂ alone, and "How much it uses" is always drawn,
straight after the cost, on all three surfaces. Consumption never moved the environmental score, so
the result only points at it, and only where the two are connected: for a petrol or diesel car the
CO₂ figure is the fuel it burns (`EnvironmentReading.usage`). Its last words, "how much fuel it uses", are a
link that scrolls to the nearest "How much it uses" (`lib/usage-anchor.ts`): up the drawer in the
in-page panel, up the pinned car's card, or to the same tab's "Energy use" on the advice page. An electric car's electricity use
moves nothing here, and a plug-in hybrid's note already says how its fuel use bends the figure, so
neither gets the line.

**The "i"s.**

| Where | Title | Says |
| --- | --- | --- |
| Class pill, right of "CO₂ while driving" | *What does Class D mean?* | The A–G CO₂ label cars get in Germany, what this letter means ("Class D means moderate emissions"), and that it comes straight from the CO₂ number. |
| 136 g/km | *Where does 136 g/km come from?* | Roughly what new petrol and diesel cars sold in Europe put out on average (ICCT); just there to compare against, not a limit or target. |

**Where the class sits, and how the "i"s open.** The class pill sits in the CO₂ row's name
cell, to the right of "CO₂ while driving / This decides the match.", because it is that number
said as a letter. Every "i" opens a tooltip beside its number rather than laying text out under
the section. On the Advice page and pinned cards that is the shared React `Tip`; in the in-page
panel it is `infoTip()` in `sections.ts`, used by every "i" there (the environmental table, the
usage section, feature chips and cost rows). It is appended to the panel's shadow root outside the
scrolling column, positioned from the button (above, or below when there's no room), kept inside
the panel's width, follows the column as it scrolls, opens on hover and focus, pins on click, and
closes on a second click, Escape or a tap anywhere else, with one open at a time. The old inline
explanation blocks and the feature groups' shared explanation slot are gone.

**What the CO₂ means, in words and colour.** The CO₂ row's pill and the class pill both say what
the car's A–G class means, in its colour:

| Class | Words | Colour |
| --- | --- | --- |
| A | Very low emissions | green (`success`) |
| B | Low emissions | green |
| C | Fairly low emissions | green |
| D | Moderate emissions | yellow (`warning`) |
| E | Higher emissions | yellow |
| F | High emissions | orange (`caution`, `finn-influence-orange`) |
| G | Very high emissions | red (`error`) |

The class is the model's, computed from the CO₂ figure, so the words can never disagree with the
letter. The row's left edge takes the same colour. A plug-in hybrid is the exception: its letter
depends on how often it's charged, so its pill reads *If charged often* in the colour of its match,
and its class pill stays FINN blue rather than a green that would contradict its note.

The distance from 136 g/km is said once, in the answer: "That's about 7% below the FINN Lens
comparison point for petrol and diesel cars", followed by what that means for the match. The
table itself carries no percentages.

**Fuel, in plain words.** Fuel use is drawn only in "How much it uses": its card's verdict is the
car's fuel-use label, and what it runs on is the pill beside the card's name, tinted in the card's
tone as the class is on the CO₂ card. See "Fuel-use labels" below.

**Fuel-use labels (2026-09-11).** "Highly efficient / Moderately efficient / Less efficient" and
the table's "Uses less / About the same / Uses more" were two vocabularies for one reading, and
neither said what the car actually does. Both are replaced by one five-step label from
`assessEfficiency`, named after what the car uses, in the pattern of the CO₂ class words:

| Step | Label | Colour | Petrol | Diesel | Electric | CO₂ class it lines up with |
| --- | --- | --- | --- | --- | --- | --- |
| `veryLow` | Very low fuel use | green | ≤ 4.1 L | ≤ 3.6 L | ≤ 12 kWh | A–B |
| `low` | Low fuel use | green | 4.2–4.9 L | 3.7–4.3 L | 12.1–14.5 kWh | C |
| `moderate` | Moderate fuel use | yellow | 5.0–6.6 L | 4.4–5.9 L | 14.6–19.4 kWh | D–E |
| `high` | High fuel use | orange | 6.7–7.5 L | 6.0–6.6 L | 19.5–21.9 kWh | F |
| `veryHigh` | Very high fuel use | red | ≥ 7.6 L | ≥ 6.7 L | ≥ 22 kWh | G |

Electric cars read "… electricity use". The edges are the model's own: `EFFICIENCY_BAND` either
side of the reference (the existing `level` edges, unchanged, which a test pins) and twice that for
"very". The band is one CO₂ class wide, 20 g/km, so for petrol and diesel the steps fall where the
classes do and a car's fuel pill takes the same colour as its CO₂ pill, which a test also pins. An
electric car's two pills can disagree (a class A car with *Very high electricity use*), and that
is the point: two separate questions.

`efficiency.step` carries the step, `efficiency.label` the words; `USE_TONE` in
`environment-copy.ts` maps a step to its tone and `efficiencyTone()` in `usage-copy.ts` gives the
chip its classes, so the table and "How much it uses" can't disagree. Shown on the in-page panel,
the pinned car's card and the Advice page, and in the Advice page's challenger line: "Polo, the
recommendation, has moderate fuel use at 5.2 L/100km."

**Saying it's consumption (2026-09-11).** Under the car's own figure the line used to be the unit
in words, "litres of petrol per 100 km", which never said the number is how much the car
consumes. It's now `efficiency.consumes`, "This car consumes 4.7 litres of petrol per 100 km"
("… kWh of electricity per 100 km" for an electric car), in "How much it uses" on all three
surfaces and in the environmental table's fuel row. The sentence under the readouts used to open
with the same fact ("This car uses 4.7 litres of petrol to drive 100 km."), so it now starts from
the comparison: "It uses about 19% less petrol than the 5.8 L/100km FINN Lens benchmark, so its
fuel use is noticeably lower than the benchmark." The "i" is unchanged.

**Benchmark, and explanations in place (2026-09-11).** "FINN Lens reference" is now "FINN Lens
benchmark" wherever a reader sees it: the table and readout captions, `referenceLabel`, the
sentences ("…than the 5.8 L/100km FINN Lens benchmark, so its fuel use is broadly in line with the
benchmark.") and the explanation titles. The code keeps its `reference` names, and "comparison
point" still describes what the number is.

The "i"s in the environmental table and "How much it uses" no longer open tooltips. Each row has
one "i" at its far right, where an accordion's arrow would be; clicking it opens the row's
explanations under the row, and clicking again closes it. Rows open independently.

| Row | Opens |
| --- | --- |
| CO₂ while driving | What does Class D mean? · Where does 136 g/km come from? ("Why is there no class?" when there's no figure) |
| Fuel / electricity use | What does this number mean? · Where does 5.8 L/100km come from? |
| Plug-in hybrid's fuel and electricity use | nothing, so no "i"; the space is kept so the columns line up |
| This car (How much it uses) | What does this number mean? |
| FINN Lens benchmark (How much it uses) | Where does the FINN Lens benchmark come from? |

The class pill no longer has an "i" of its own; what the letter means opens from its row. The two
readouts in "How much it uses" became rows in a bordered card, so each has a far right to put its
"i" at. A button that opens one explanation is named after it; one that opens several is "More
about fuel use". `components/ExplainedRow` on the pages, `explainedRow` in the panel; an exported
file shows every row open. Feature chips and the panel's cost lines keep their tooltips.

**Layout.** The table header is pale FINN blue. A container query lays each row out as one column
when very narrow, the row's name over this car and the reference side by side from 18rem, and
three columns with the header from 28rem; captions and figures share grid rows, so a caption that
wraps can't push its figure out of line.

**By powertrain.**

| Car | What changes |
| --- | --- |
| Petrol / diesel | "litres of petrol" / "litres of diesel"; the diesel reference's "i" says why it's lower. |
| Electric | "This car produces no CO₂ while you drive it, so it's a strong match…"; `0 g/km`, *Very low emissions* (Class A, green); *Electricity use* against 17 kWh/100km; no fuel words. |
| Plug-in hybrid | "In the official EU test, this car produces 30 g… but only if you charge the battery often…"; a short note; *If charged often* in the match's colour and a FINN-blue class pill; *One combined figure / None* with no "i". |
| No consumption | The fuel row reads "Not published", with no reference, comparison or "i". |
| No CO₂ | No surface gets a reading (the category scores `null`); unchanged. |

The priority header's subtitle (`describeCoverage`) now reads "126 g of CO₂ per km" rather than
"126 g/km · Class D", since the class has its own pill directly beneath it.

**How it got here (same day).** Provenance chips → a table with seven closed questions → "i"s on
the figures with the class in the first sentence → comparison cards with folds and a five-question
list → this: the colourful table again, no accordion around it, no questions, the class as a pill
with an "i", and plain words in place of percentages.

**Export.** Each "i" has its `FigureInfoExport` twin, laid flat under its number in a PDF.

**Found on the way.** `ENVIRONMENTAL_METHOD` called A–G "the EU's own scale"; it is the German
label (copy fixed). Emoji icons rendered as empty boxes in Chromium, so rows use lucide `cloud` /
`fuel` / `zap`, generated into the panel's icon set.

**Pinned.** `lib/environment-copy.test.ts`: the answer verbatim for every band and powertrain; the
class pill's label and explanation for every letter; each row's figures, units, references, "i"s
and colour; the comparison words at every edge and that they agree with the efficiency label; no
percentages anywhere; plug-in hybrid and missing-consumption rows; the closing disclaimer; no
report language ("benchmark", "equivalent", "combustion", "WLTP"…), marketing words or em dashes;
and that the assessment is left untouched. `panel-copy.test.ts` pins the pill inside the CO₂ row's name cell and its tooltip, each "i"
opening and closing a tooltip with one open at a time, the answer before the table, no accordion or FAQ, which numbers carry an "i", words not percentages,
the disclaimer last, the plug-in hybrid row and the edge colours. `environmental.test.ts` pins the
plain-language `referenceDerivation`.

### The order, as first fixed (superseded 2026-09-11)

```
1. what this car is        the emissions result, in words     ← the answer
2. what it rests on        the two figures, each with meaning
3. what they mean together where emissions and efficiency disagree
4. what it doesn't cover   the caveats, kept but shortened
5. how it's worked out     folded away behind one line
```

`components/EnvironmentalResult.tsx` renders this for React (`concise` on the Advice page,
`detailed` in the pins drawer); `impactBreakdown()` in `sections.ts` renders the identical
order in hand-rolled DOM, because the in-page panel lives in a shadow root and may not carry
React. Both read the same fields from the same assessment — if a claim isn't on the
assessment it isn't on the screen.

Threading it to the Advice page needed `PriorityReasoning.environmental`
(`narrative/types.ts`): the assessment now travels whole rather than being flattened into
`measurements`, which is why that page can show a class letter and an efficiency label at all.

### The caveats: compressed, then narrowed to the two that earn their place

They were first shortened (a 200-character ceiling, pinned by test — the plug-in hybrid caveat
previously ran ~300 characters of methodology, which is what made it impossible to place below
the answer without swallowing it) and ordered most-specific-first.

The generic lifecycle line — *this counts what comes out of the car, not what building it
cost* — was then **removed from the per-car caveats and left in the method notes**. It is true
of every car equally, so as a per-car line it told the reader nothing about the car in front of
them, and a line readers learn to skip costs the caveats beside it their credibility. Two
remain, and both name something a reader would otherwise misread:

| Powertrain | Caveat |
| --- | --- |
| Electric | Zero is zero *from the car*; making the electricity isn't free, and FINN's data doesn't say where yours comes from. |
| Plug-in hybrid | The figure assumes regular charging; drive it on petrol and real emissions are several times higher. |
| Petrol / diesel | *(none — nothing about reading "140 g/km" is counter-intuitive)* |

### Two claims the copy was making that the data didn't support

1. **"A typical new petrol car."** See §5. Corrected to the fleet benchmark it actually is.
2. **"Low emissions," on a plug-in hybrid.** The pill said *Low emissions* directly above a
   caveat saying the real figure may be several times higher — the panel arguing with itself.
   The label is now *Low only if you charge it*, drawn in the neutral band rather than the
   flattering one. **The figure and the score are unchanged**: no corrected number is
   invented, for the reasons in §6.

`ENVIRONMENTAL_METHOD` was rewritten to open on what the priority measures rather than on
what it excludes, and `lib/car-labels.ts` no longer subtitles the priority with
"Judged on emissions, not on equipment" — every other priority's subtitle says something
about the car, and that one said something about Finn Lens.

### "Says who?" — the provenance chips (retired 2026-09-11)

The second round of feedback found the copy was answering *what* without answering *by whose
reckoning*. "Above-average emissions" reads as though a car has failed a standard, and
"Moderately efficient" as though a regulator publishes how much a car ought to burn. Neither is
true, and the three benchmarks in this model are three different kinds of thing:

| Label | What it is measured against | Kind of thing |
| --- | --- | --- |
| `Class E` | Pkw-EnVKV §3a A–G bands | **Set in law.** The only one. |
| `Above-average emissions` | 136 g/km, ICCT registration data | **An observation.** No legal force. |
| `Moderately efficient` | Finn Lens's reference: 5.8 / 5.2 L/100 km, 17 kWh/100 km | **Derived here.** A comparison point — not an official figure, and not what petrol, diesel or electric cars average. |
| `Diesel` | — | Context: it says how to read the other two. |

`environmentalTags(assessment): EnvironmentalTag[]` returns each label with its own `title` and
`body` answering that question, and both renderers hang them behind a tap on the chip — one open
at a time, because this is a footnote and not a second article. The emissions chip is explicit
that EU CO₂ limits bind *a manufacturer's whole range over a year*, so no individual car is over
or under one; the efficiency chip is explicit that its benchmark is worked back from the same
136 g/km through the carbon in a litre, which is also why the petrol and diesel figures differ.
Since 2026-09-11 that footnote is `EfficiencyAssessment.provenance`, the same text the usage
sections show behind the "i" beside the reference, so the chip and the
section can't tell two stories. The emissions chip no longer says EU limits bind a
manufacturer's range "over a year": 2025–2027 compliance is averaged over three years.

A plug-in hybrid gets a different emissions chip — its own figure is the thing in question, so
comparing it with what other cars emit would answer a question nobody asked.

The powertrain also now appears on the recommendation itself (`AdviceHero`, `ChallengePicker`),
not only inside the environmental reading. What a car runs on is among the first things that
decides whether a reader can live with it.

### What is pinned

`environmental.test.ts` gained a `the shape of the explanation` block: emissions lead the
prose (the regression it catches is the old sentence opening on the efficiency half), every
figure carries a label and an explanation, caveats survive and stay short, the tradeoff aside
appears only where the two figures genuinely disagree, and no copy anywhere — sentences,
labels, caveats, method notes — matches the marketing vocabulary this model can't support
("green choice", "clean car", "sustainable", "zero-impact", and the rest).

A `where each number comes from` block pins the provenance: that the class chip names the law,
that the emissions chip says the average is "not set by anyone as a target" and that EU limits
bind a manufacturer's range rather than a car, that the efficiency chip names Finn Lens's
reference and where it comes from, and that neither the electric car nor the plug-in hybrid is
shown a fleet comparison it doesn't have.

A `what the efficiency reference is, and isn't` block (2026-09-11) pins the arithmetic
(136 ÷ 2 330 and 136 ÷ 2 640), that `L/100km` is said in words before it is judged, that the
reference is labelled as Finn Lens's and never as what petrol, diesel or electric cars average
(nor "typical for its kind", "most cars"), that it is never called a limit, that WLTP is called a
standardised test with real-world use higher, that a missing CO₂ figure is never read as zero, and
that the EQS-SUV case stays two answers. `panel-copy.test.ts` and `advice-card.test.ts` pin the
same wording on the rendered surfaces.
