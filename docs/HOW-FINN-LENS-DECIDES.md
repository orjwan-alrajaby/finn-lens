# How FINN Lens decides

> **What this is.** The reference for how Lens turns a conversation into a judgement of the cars on a
> finn.com page: every mechanism, every number, the reasoning behind each decision, and what each one
> rests on — FINN's own data, arithmetic on it, a published European source, or Lens's own labelled
> assumption. Written for anyone changing the engine, reviewing it, or checking a claim it makes.
>
> **State described:** branch `life-bubbles` at `6211b25` (7 October 2026). `npx tsc --noEmit` clean,
> `npx vitest run` green (914 tests).
>
> **Related documents.** [`FINN-LENS-EMISSIONS-SCORING.md`](FINN-LENS-EMISSIONS-SCORING.md) is the long
> form of the CO₂ and efficiency scoring (§7 here summarises it).
> [`LIFE-BUBBLES-SPEC-v2.md`](LIFE-BUBBLES-SPEC-v2.md) is the design of the conversation, with an "As
> built" log of what changed after trying it. The code comments are the last word on any detail; this
> document points to the files.

---

## Contents

1. [The rule behind everything: where a claim may come from](#1-the-rule-behind-everything-where-a-claim-may-come-from)
2. [The pipeline, end to end](#2-the-pipeline-end-to-end)
3. [What the reader is asked, and what each answer does](#3-what-the-reader-is-asked-and-what-each-answer-does)
4. [From answers to engine settings](#4-from-answers-to-engine-settings)
5. [Scoring one car in one priority](#5-scoring-one-car-in-one-priority)
6. [Measurements: size, range, charging](#6-measurements-size-range-charging)
7. [CO₂ and efficiency](#7-co₂-and-efficiency)
8. [The fit, and the bands](#8-the-fit-and-the-bands)
9. [Hard constraints: what sets a car aside](#9-hard-constraints-what-sets-a-car-aside)
10. [Cost](#10-cost)
11. [Who may win](#11-who-may-win)
12. [What the reader is shown](#12-what-the-reader-is-shown)
13. [Sources register](#13-sources-register)
14. [Lens's own assumptions](#14-lenss-own-assumptions)
15. [Decisions considered and rejected](#15-decisions-considered-and-rejected)
16. [Known gaps and open items](#16-known-gaps-and-open-items)
17. [Refreshing the data](#17-refreshing-the-data)

---

## 1. The rule behind everything: where a claim may come from

Every figure Lens shows, every link between a need and a piece of equipment, every score input and every
cost must come from one of four places — and the reader must be able to see which:

| Source | What counts | How it's shown |
|---|---|---|
| **FINN's data** | What FINN's API returns for a car: equipment flags, fuel type, consumption, CO₂ figure and class, dimensions, electric range, prices per term, mileage packages, delivery windows. | As the car's own fact. "Listed" and "not listed" are facts; only an absent field is unknown. |
| **Arithmetic on FINN's data** | Anything derived from FINN's figures: a shorter car needs a shorter gap; consumption × price; how many cars on this page are low CO₂. | As Lens's working, with the inputs named. |
| **Published European sources** | EU regulations and data (EEA registrations, Regulation (EU) 2019/631), German law (Pkw-EnVKV), the European Commission's reports, studies and tests by the ICCT and the ADAC. | Named **and linked** where the claim is made, with the caveat that it's that source's figure or finding, and what it can't tell the reader. Each figure was checked in the actual document before use (§13). |
| **Lens's own assumptions** | A number Lens has to pick with no source to take it from: a fuel price, a band threshold. | Labelled as an assumption every time ("an assumed fuel price of €1.75"). Listed in §14. |

What is **not** allowed, and has been removed when found:

- **General knowledge dressed as fact.** "Petrol, including hybrids you don't plug in", "a plug-in's figure
  assumes it's charged often", "typically more speakers", "making electricity isn't free of emissions" —
  none of these is in FINN's data, and none was sourced. Cut, or replaced by what FINN's data says and
  doesn't say (§15).
- **An unsourced number presented as a bound.** The "30 kWh/100 km allowance" for plug-in hybrids had no
  source; it was replaced by the EU's official figure for each car (§10.3).
- **Claiming more than FINN's field says.** FINN's "Sitzheizung" doesn't say which seats; "Parkassistent"
  doesn't say whether it steers; "Anhängerlast" doesn't say braked. The copy says exactly that much.
- **A claim out of its context.** The Commission's 3.5× real-world gap for plug-ins is for cars registered
  in 2021, before the EU changed the method in 2025 — so it's always said with that date (§7.3).

**Unknown is never no.** A field FINN doesn't send is unknown. An unknown item is left out of a score
entirely — never counted as absent, never as average (§5). A cost that can't be calculated is never €0
(§10). A hard constraint can't be met by a car whose data can't confirm it (§9).

---

## 2. The pipeline, end to end

```
 Conversation (lib/chats/flow.ts)
   bubbles · how often · limit · period · from when · distance · fuel · deal-breakers & sealers
        │
        ▼
 Understanding (lib/lens-chat/understanding.ts, bubbles.ts, deals.ts)
   needs (each: importance + evidence it counts / checks)   rules (must / mustn't)
   budget (amount, hard / some give)   rental (from → to)   monthly km
        │  toAnswers()
        ▼
 Engine settings — "Answers"
   priorities in order + each one's share     items raised per priority, at a level
   standard items to check                    preferences (budget ceiling, dates, km, prices)
        │  runLens() (lib/lens-chat/run.ts)
        ▼
 1. Rules set cars aside (deal-breakers, fuel)        → if none left: rank all, ask what to let go
 2. buildRecommendation() (lib/reasoning-engine/index.ts)
      cost for every car → budget status → score every car → eligibility tiers → winner
 3. A firm limit sets aside cars over it, or not confirmed within it
 4. Nothing within the limit → rank the cars nearest it
        │
        ▼
 Judgement (lib/chats/judge.ts) → a verdict per car, the result card, chips on finn.com
 Fit story (lib/lens-chat/fit-story.ts) → the drawer's "whole case" for any car
```

Two separations run through it:

- **Budget never touches the score.** Cost decides who is *allowed* to win; the score decides who is
  *best*. A cheap car scores no higher for being cheap (`buildRecommendation`, index.ts).
- **A car's score depends on that car and the reader's settings only.** No other car on the page can move
  it (`scoreVehicle`, scoring.ts). Viewing one car alone and the same car in a comparison give the same
  score; adding a car never reorders the others. The exceptions are explicit and said: efficiency is read
  against cars on the same fuel (§7.2), and "N of the cars here" counts are about the page.

---

## 3. What the reader is asked, and what each answer does

The questions, in order (`STEP_ORDER` and `BUBBLE_STEPS`, flow.ts). Each open question shows
"Answered *n* of *m*"; the total grows or shrinks as answers add or remove questions.

### 3.1 The bubbles: four sections

| Section | Bubbles |
|---|---|
| Who rides with you? | Kids · Adults · A dog |
| Where and how do you drive? | In the city · In traffic · Long distances · At night |
| What does the car have to cope with? | Tough weather · Lots to carry |
| What else matters to you? | Help driving & parking · Comfort · The environment · A budget |

Each bubble (`BUBBLES`, bubbles.ts) carries:

- **counts** — equipment Lens scores for it (it earns when listed);
- **checks** — standard equipment Lens checks for it: a car FINN says lacks it loses a little, and having
  it earns nothing (§5.2);
- **worth** — suggestions shown as "Might matter" on the summary, counted only if the reader adds them;
- **cantCheck** — what FINN's data can't tell Lens for this need, said on the summary;
- **why** — for each item, why it's there for this need. A link with no honest reason is removed, not
  justified.

Some bubbles open a row of **chips** (follow-ups) that change what's counted:

| Bubble | Chips (what each adds) |
|---|---|
| Kids | Baby or toddler seat (makes kids a top priority; suggests electric tailgate) · Booster seat · Older kids (suggests 3-zone climate, rear USB) |
| Adults | Beside me (asks nothing extra; the summary says so) · In the back (rear doors; suggests 3-zone climate, rear USB) |
| In the city | Where you park, up to two: street (reversing camera) · home garage (width counts more; folding mirrors checked) · multi-storey (360° camera; folding mirrors) · open car park (rear cross-traffic alert) · driveway (nothing extra) |
| Help driving & parking | Parking (360° camera; sensors checked) · **Parallel parking** (a shorter car, 360° camera; parking assistant and sensors checked) · Traffic & lane changes (blind spot; lane keeping checked) · Reversing out (rear cross-traffic alert, reversing camera) |
| Tough weather | Snow & ice (snow can't come without cold, so it counts heated seats & wheel itself; **recommends all-wheel drive** — §9.2) · Rain & fog (rain & light sensors, fog lights; mild or cold) · Cold winters (heated seats & wheel; wet or dry, so it combines with rain) · Hot summers (ventilated seats). Any combination, all four with "Select all". |
| Lots to carry | Shopping (electric tailgate) · Bulky things (split-folding seats) · Bikes, skis, roof box (roof rails) · Trailer or caravan (towbar, 1,500 kg towing; suggests the towbar deal-breaker) |
| Comfort | 14 comforts FINN lists and Lens can score, each by name (heated seats, heated wheel, ventilated seats, pre-heating, keyless entry & start, wireless CarPlay / Android Auto, wireless charging, 3-zone climate, electric seats, lumbar support, premium sound, sunroof, rear USB ports, head-up display). Leather and ambient lighting are said not to count. |
| The environment | **How green should the car be?** — §7.4 |
| A budget | How firm: Hard limit · Some give — §9.4 |

Chip rules: "Select all" where several can be true and there's no cap, never picking two that can't both
be true (`allChips`, flow.ts); exclusive pairs are enforced on the page and again in the flow.

**Recommended comforts.** Comfort chips that earlier answers point to are starred, first, with the reason
(`RECOMMENDED`, `recommendedBecause`, bubbles.ts): heated seats and pre-heating for snow & ice or cold & dry;
a heated wheel for the same, "and you spend a lot of time on the road" beside long distances or traffic;
lumbar support and wireless CarPlay / charging for long distances or traffic; and so on. Nothing is picked
for the reader. Rain alone doesn't recommend warmth; a bubble's own answers never recommend its own chips.

### 3.2 How often (long distances, traffic)

Asked only for a bubble that has it (`OFTEN`, bubbles.ts). It sets how much the bubble counts: every day /
every week → Top priority; about once a month → Important; a few times a year → Nice to have. Traffic:
over 45 min → Top priority; 20–45 → Important; under 20 → Nice to have. Long distances also makes the
distance question matter.

### 3.3 How much something counts — one scale

Top priority · Important · Nice to have (`IMPORTANCE`, `lib/lens-chat/importance.ts`). Each counts twice the
one below (`NEED_WEIGHT` 4 : 2 : 1, understanding.ts). Said to the reader in words, never numbers:

- **Top priority** — counts the most, twice as much as Important; a car without it can still win, but only
  by being clearly better at everything else.
- **Important** — counts fully, alongside everything else said to be important.
- **Nice to have** — counts half as much as Important: enough to settle a close call.

None of them rules a car out. "Must have / Must be / Mustn't be" are reserved for deal-breakers, so the two
vocabularies never meet. A bubble starts at Important unless a chip or "how often" says otherwise, shown as
"My guess — tap to change".

### 3.4 Money and time

- **Limit**, "all costs together": FINN's monthly price (VAT included), plus estimated fuel or charging, plus
  the mileage package the reader's distance needs. Parking and tolls are not in it.
- **How long**, then **from when** (next month is the soonest — FINN delivers in weeks — and the three after,
  or later). The length is kept when the start moves.
- **How far**, asked only when something said makes it matter; otherwise 1,000 km/month, said as assumed.

### 3.5 What it can run on

Electric · Plug-in hybrid · Petrol · Diesel, any or all, only the fuels on the page (`fuelStep`, flow.ts).
Not asked when the page has one fuel. Fuels not picked are set aside before scoring (§9.1). Each choice says
only what FINN lists:

- FINN has exactly four fuel types — no "hybrid". Where FINN files cars with "Hybrid" in its own engine name
  under petrol (83 in the fleet snapshot, e.g. "Toyota Yaris 1.5-l-VVT-i Hybrid 116 CVT"), Petrol's "i"
  counts them from the page.
- Plug-in hybrid's "i" says FINN gives only the fuel figure, and the electricity is the EU's figure (§10.3).
- Stars from how green (§7.4): totally green → Electric; moderately green → any fuel most of whose cars on
  the page are low CO₂, with the count.

### 3.6 Deal-breakers & deal-sealers

One row per thing (`DEALS`, deals.ts): Over my limit · Low CO₂ emissions · Frugal for its kind · Automatic
gearbox · SUV · Rear doors · Six or more seats · Towbar · All-wheel drive. Each set to:

| Option | Means |
|---|---|
| Doesn't matter | Not part of the judgement. |
| Must be / Must have | A deal-breaker: any car without it is set aside before scoring. |
| Mustn't be | A deal-breaker: any car that is one is set aside before scoring. |
| Seals it | A deal-sealer: counts as a top priority, but a car without it can still win. |

The meanings are shown as a key under the question. A row offers only what Lens can do with it here: a rule
only where it would split the cars on the page; "Seals it" only where Lens can score the thing and the cars
here differ on it. A row Lens can only rule on says so ("I can only rule on this, not weigh it — so it can't
seal the deal"). Rows the reader's answers point to come first, starred, each saying which answer
recommended it.

### 3.7 The summary, and adjusting it

"Here's what you told me, and what I understood" is read-only: each thing said, how much it counts, what
Lens will check; then money & time and deal-breakers & sealers. **Looks good to me — continue** goes on;
**This doesn't look right** opens the Adjust panel (beside the chat, which widens for it) with every
editable card: take an item out, add a suggestion, set how much each counts, or change an answer.

---

## 4. From answers to engine settings

`toAnswers()` in understanding.ts. In the chat it runs **asked-only** (`countOnlyAsked`): Lens ranks on what
the reader asked for and nothing else.

### 4.1 Which priorities, in what order

The engine scores seven priorities (`CATEGORIES`, constants.ts): Safety & Driver Assistance, City & Parking,
Practicality, Long Distance Travel, Climate Suitability, Comfort, plus Environmental Impact and Efficiency
(figure-only, §7). A need **holds** a priority by the equipment of its that is scored there — not by naming
it. "Kids in the back" named Safety and held nothing Safety scores, so parents were once judged on blind
spot warning; that was the bug this rule fixes. A need with no equipment (CO₂) holds the priority it names.

Order: the strongest single need decides a priority's place; how many needs it serves only breaks ties. No
padding: in a chat, a priority nothing the reader said points to isn't scored at all.

### 4.2 How much each priority weighs

- **Chat (asked-only).** Each need contributes its importance weight (4 / 2 / 1) **split evenly across the
  priorities its equipment sits in**; a priority's share is the sum of what its needs put there
  (`priorityShares`). So seven items for kids don't outweigh one CO₂ figure seven to one: a need is a need,
  however many items Lens checks for it.
- **Settings screen (classic).** By rank: with *n* priorities the first weighs *n*, the next *n−1*, … over
  their sum (`priorityWeights`, scoring.ts).

### 4.3 How much each item weighs inside a priority

`FEATURE_IMPORTANCE`, constants.ts. Every catalogue item counts once (`BASE_FEATURE_WEIGHT` = 1). An item
singled out counts again for how much: Somewhat 2, Moderately 3, Highly 4. Steeper than this (the old 5 : 1)
let five picks drown out the ten to fifteen other things a priority is made of.

In the chat, a need's items are raised at its importance (`RAISE`: Top priority → Highly, Important →
Moderately, Nice to have → Somewhat). A few chips count an item one step higher (`STRONGER`): a home
garage makes width count more. Items a rule already settles aren't raised — every car left has them, so
raising them adds the same to each. Things the reader wants absent are never raised.

---

## 5. Scoring one car in one priority

`categoryDetail()` in scoring.ts.

### 5.1 The arithmetic

```
featureScore = 100 × max(0, Σ weight × utility  −  Σ weight of standard items FINN says are missing)
                     ───────────────────────────────────────────────────────────────────────────────
                                       Σ weight of items whose utility is known
```

- **utility** is 1 (listed), 0 (not listed), or a 0–1 reading for a measurement (§6). Unknown items are left
  out of numerator and denominator alike.
- **Assessed** only when at least half the priority's counted weight is known (`ASSESSED_SHARE` = 0.5).
  An unassessed priority is left out of the car's fit and said to be unassessed, never scored as zero.
- An item that means nothing for this car — a heat pump on a petrol car — isn't counted for it.
- **Contributions** add up exactly to the fit, one line per piece of counted evidence, so the drawer can show
  the working.
- **Bounds**: the fit with every unknown at its worst and at its best — the check behind "this could change
  depending on…" (§11.3).

### 5.2 Standard equipment

An item on at least 90% of FINN's cars (`BASELINE_PREVALENCE`, evidence.ts; re-checked against the fleet
snapshot on every calibration run) is **expected**: having it earns nothing, a confirmed gap costs its
weight. Counted as earning, it would add the same to every car and only squeeze the differences. Examples:
emergency braking, lane keeping, ISOFIX, parking sensors and parking assistant (704 and 703 of 728).

### 5.3 What's in each priority

From `CATEGORIES`, constants.ts. *Niche* items count only when raised (a towbar matters to someone who tows).

| Priority | Scored items | Standard (checked) |
|---|---|---|
| Safety & Driver Assistance | blind spot assist, rear cross-traffic alert, matrix LED headlights | emergency braking, lane keeping, sign recognition, eCall, tyre-pressure monitoring |
| City & Parking | compact length, compact width (§6), reversing camera, 360° camera | parking sensors, parking assistant, folding mirrors, automatic gearbox |
| Practicality | rear doors, five seats, split-folding rear seats, electric tailgate; *niche:* towbar, 1,500 kg towing, roof rails, six+ seats | ISOFIX |
| Long Distance Travel | level 2 driver assistance, lumbar support, head-up display; *niche:* spare wheel; also matrix LED. Electric cars: range and DC charging limit it (§6) | cruise control, adaptive cruise, navigation |
| Climate Suitability | heated seats, rain & light sensors, heated wheel, cornering lights, seat cooling, fog lights, auxiliary heater, headlight cleaning, heat pump; *niche:* all-wheel drive | air conditioning |
| Comfort | wireless charging, keyless entry & start, premium sound, 3-zone climate, electric seats, wireless CarPlay / Android Auto, sunroof, rear USB | CarPlay / Android Auto |
| Environmental Impact / Efficiency | figures, not equipment (§7) | — |

**Boot space is not scored** (`BOOT_SCORING_ENABLED = false`): FINN's litres are seats-up on one car and
seats-folded on the next — the same BMW X1 appears at 1,545 L and 500 L. The curve is ready; it stays off
until a seats-up source is verified.

---

## 6. Measurements: size, range, charging

Fixed curves in evidence.ts, straight lines between anchors, flat beyond the ends — so a car's reading
depends on the car alone. The anchors come from the distribution of FINN's own fleet.

| Reading | Anchors (value → utility) | Why |
|---|---|---|
| Compact length | 4.0 m → 1 · 4.3 → 0.8 · 4.6 → 0.55 · 4.9 → 0.3 · 5.2 → 0 | Flat at 4.0 m and shorter so a tiny car isn't rewarded for being ever tinier. A shorter car needs a shorter gap — the parallel-parking reasoning is this, from FINN's length. |
| Narrow width | 1.75 m → 1 · 1.85 → 0.7 · 1.95 → 0.35 · 2.05 → 0 | FINN's cars run 1.60–2.24 m, most 1.82–1.90 m. |
| Electric range (limits Long Distance) | 300 km → 0.55 · 350 → 0.7 · 400 → 0.85 · 480 → 1 | Can only lower the score. Past 480 km what separates cars on a long drive is charging speed. An electric car with no published range is unassessed there. |
| DC charge 10–80% (limits Long Distance) | 30 min → 1 · 45 → 0.85 · 60 → 0.7 | Flat to 30 min, where most of FINN's electric cars sit (median 26; slowest 52). Gentler than range: a slow charge makes a stop longer, a short range makes more of them. |

---

## 7. CO₂ and efficiency

The long form, with the reasoning and evidence, is [`FINN-LENS-EMISSIONS-SCORING.md`](FINN-LENS-EMISSIONS-SCORING.md).
In short (environmental.ts):

### 7.1 Environmental Impact is the CO₂ figure, on the German label

- **One figure, not four.** The old model averaged CO₂ g/km, CO₂ class, consumption and fuel type. Since the
  Pkw-EnVKV amendment of February 2024 the German class is a pure function of WLTP CO₂ (A at 0 g/km, B to
  95, C to 115, D to 135, E to 155, F to 175, G above), and a combustion car's consumption *is* its CO₂ times
  a constant. Scoring them separately counted one measurement several times.
- The class boundaries are the regulation's, not Lens's (Pkw-EnVKV, §13).
- **Electric cars:** FINN sends class A but no g/km figure; class A on the German label is 0 g/km, so Lens
  fills the gap with 0 and says where it comes from. The figure covers driving only, not making the
  electricity, and FINN's data doesn't say where the reader's would come from.
- For comparison, new combustion cars emit about 136 g/km (ICCT: about 134 g/km, flat since 2021, from EEA
  data — §13).

### 7.2 Efficiency is consumption, against cars on the same fuel

A litre and a kilowatt-hour aren't comparable, so efficiency reads each car against **Lens's reference for
its own fuel**: for combustion cars, the litres equivalent of 136 g/km; for electric cars, 17 kWh/100 km,
rounded up from the ICCT's 16.2 kWh/100 km sales-weighted official figure for medium electric cars in
2023 (§13). Said as "Finn Lens's reference", never as what cars "typically" use. A plug-in hybrid isn't
graded on efficiency: there is no petrol or electric car it can fairly be measured against.

### 7.3 Plug-in hybrids

- FINN gives a plug-in hybrid one CO₂ figure and doesn't say how much of the driving behind it is on
  electricity, so the figure can't be checked against how the reader would drive.
- **So it can't be rated Strong**: the best a plug-in can reach is the top of Good (`PHEV_CEILING` =
  `STRONG_FROM − 1`). No corrected figure is invented; among plug-ins a lower official figure still ranks
  higher.
- **Sourced context, always with its date:** the European Commission found plug-ins registered in 2021
  emitted on average 3.5 times their official CO₂ on the road (SWD(2024) 59). The EU changed the official
  method from 2025 (Euro 6e-bis), and FINN's figures use the new one — so the 3.5× is never applied to
  FINN's cars, only reported with its date.

### 7.4 How green should the car be?

The environment bubble's question (bubbles.ts):

| Answer | Judged on | Suggests / stars |
|---|---|---|
| Clean for its fuel type | Efficiency — consumption against cars on the same fuel, as FINN lists it | Nothing |
| Moderately green | CO₂ class (low CO₂ = class A–C, 115 g/km or less) | Low CO₂ deal-breaker; stars fuels most of whose cars here are low CO₂ |
| Totally green | CO₂ class, as a top priority | Stars Electric (FINN lists electric cars in class A, 0 g/km on the label) |
| *(nothing picked, e.g. "eco-friendly" typed)* | CO₂ class | Low CO₂ deal-breaker |

How much it counts stays on the one scale, on the summary.

---

## 8. The fit, and the bands

- **Fit** = the weighted average of a car's scores over its **assessed** priorities only (`scoreVehicle`).
- **Judgeable** = the reader's top two priorities are both assessed. Only a judgeable car can be
  recommended or given an overall band.
- **Bands** (bands.ts) on the 0–100 fit: Strong from 65 · Good from 45 · Partial from 25 · Limited below.
  "Not enough data" for a car that can't be judged. **Provisional**: calibrated against score distributions
  over FINN's inventory, and expected to move when that calibration runs. What each band *means* is fixed in
  fit.ts; these numbers only place the meanings.
- The 0–100 number is never shown. The reader sees the band and counts they can check ("has 4 of the 5
  things you asked for").

---

## 9. Hard constraints: what sets a car aside

Ruling a car out is not scoring it. A reader who says "no SUV" has given a constraint, and the honest answer
is the best car that isn't one (`runLens`, run.ts).

### 9.1 Rules: deal-breakers and fuel

`allowedByRules()`, run.ts:

- **Must** keeps only cars **confirmed** to have it (`evidenceMet === true`). Unknown doesn't pass.
- **Mustn't** sets aside cars confirmed to have it (`evidenceMet !== false` passes). Unknown passes. In
  practice the mustn't rules are about fields FINN always sends (fuel type, body type) — see §16.
- **What it can run on**: every fuel not picked is a mustn't rule (`fuel` need, flow.ts).
- A rule's own evidence isn't raised in the score (every car left has it).

### 9.2 Deal-sealers, and recommendations

A deal-sealer is a need at Top priority counting exactly that one thing (`sealerNeed`, deals.ts). It sets no
car aside. Rows recommended by earlier answers: snow & ice → all-wheel drive (ADAC, §13), trailer or caravan
→ towbar, moderately green → low CO₂.

### 9.3 When no car has every deal-breaker

All cars come back and are ranked as if the rules weren't there, and Lens **puts the choice to the reader**
rather than calling it a failure (`letGoAsk`, judge.ts; fit story): "No car here has all of your
deal-breakers — so which matters least to you?", each with what letting it go opens up ("Let go of ‘must
have all-wheel drive’ and 3 cars fit everything else"), most first. Each one let go becomes a deal-sealer
where Lens can weigh it, or simply stops being a rule where it can only rule on it; then the cars are judged
again. Not something to take back, since the judgement follows straight away.

### 9.4 The limit

`budgetCeiling`, understanding.ts; `runLens`, run.ts; `resolveBudgetStatus`, cost.ts. Each car's cost is
**within**, **over**, or **unknown** (the known part fits but something couldn't be priced). Unknown never
counts as fitting.

| Reader said | What happens |
|---|---|
| **Hard limit** (or "Over my limit: Mustn't be") | Cars over it **and cars not confirmed within it** are set aside, each saying exactly what FINN's data is missing for it. A hard limit isn't met by a car that might be over it. |
| **Some give** | Cars up to 15% over count as within (`TARGET_HEADROOM` = 1.15, §14); the summary says where the line is. A named stretch ("€400, maybe €425") is the line instead. |
| A limit, firmness not said | A car over it can't win while a car within it exists; it's still graded. |
| Nothing within the limit | The ranking is redone over the cars nearest the limit, and said so — not the best car at any price. |
| No limit | Cost is reported, never used to rank. |

### 9.5 The rental period and the gearbox

Like the budget, three-state and eligibility-only (contract.ts, decision.ts): never a point added or removed.
See §10.4 for the period.

---

## 10. Cost

`calculateCost()` and `buildCostAnalysis()`, cost.ts. One question only: what does this car cost? It has no
opinion on fit or winning.

### 10.1 The three lines

| Line | From | Notes |
|---|---|---|
| **FINN subscription** | FINN's monthly price for the shortest term that covers the reader's period (§10.4), private, nothing upfront | VAT included for private prices (FINN advertises them so). Business pricing's VAT isn't in the data, so it's shown as supplied and said. |
| **Fuel / electricity** | FINN's consumption × an assumed price (§14) × the reader's distance | A plug-in hybrid adds the EU's electricity figure (§10.3). |
| **Mileage package** | FINN's own packages: the cheapest that covers the reader's distance, plus FINN's per-km price beyond its largest | FINN's price includes 500 km/month. The old model charged every km past 500 at the per-km price — €125 for 1,000 km where FINN's package costs €9; fixed against FINN's raw data. |

### 10.2 Missing is never €0, and is named

A line that can't be priced is left out of the total and marked, never counted as €0 — a car Lens can't
estimate must not look cheaper than one it can. What's missing is said by name (`missingPiece`, cost.ts),
never "part of the estimate": "FINN's private monthly price for the 24-month term — it doesn't list one for
this car", "this car's fuel consumption — FINN doesn't list one", and for an unmatched plug-in, "how much
electricity this plug-in hybrid uses — FINN lists only its fuel figure (3.8 L/100km), and its figures don't
match a car in the EU's registration data".

### 10.3 Plug-in hybrids: the EU's electricity figure

FINN lists a plug-in hybrid's official CO₂ and fuel figures but **not the electricity half of the same
test**. Every new car registered in the EU is reported to the European Environment Agency under Regulation
(EU) 2019/631 with "Electric energy consumption (EC_AC,weighted)" — point 5.2 of its certificate of
conformity (Implementing Regulation (EU) 2020/683). Lens uses that figure for the car.

- **Table** (`lib/reasoning-engine/data/eu-plug-in-electricity.json`, built by
  `scripts/snapshot-eu-plug-in-electricity.mjs`): the EEA's **2025 provisional** data only, because FINN's
  figures follow the 2025 rules (Euro 6e-bis). 2024 cars were computed under the earlier rules — the X5
  xDrive50e was 19–22 g/km and 0.9 L then, 74 g/km and 3.2 L now — so pairing across years would join
  figures that don't belong together. FINN's makers only; 4,857 variants.
- **Matching** (`euElectricityFor`, eu-electricity.ts): make; FINN's CO₂ and fuel figures exactly (fuel to the
  0.1 L the EU reports); and the longest run of FINN's own words that names the car ("GLA250E", "E300DE"),
  never generic ones ("xDrive" alone once paired a 330e with an X1). Engine power isn't used: FINN's is the
  whole system's, the EU's the engine's. 35 of FINN's 44 plug-ins match.
- **More than one version matches** (same figures, different electricity): the highest is used, and said.
- **No match**: the electricity is named as missing; the car can't be confirmed within a budget, and is set
  aside under a hard one.
- **The caveat, every time**: both figures assume the mix of electric and fuel driving set by the EU's test
  rules; how much of each the reader would really use depends on how they drive and charge. The cost line
  links the EEA source.

### 10.4 The rental period

FINN sells fixed terms (6, 12, 18, 24 months), not dates, and its data doesn't say whether a contract can be
extended or ended early. So: the term is the **shortest one on offer that covers the whole period**, priced
as such, with any months it commits the reader past their end date said out loud. Delivery is checked against
that term's own window: the car has to be deliverable in the start month. A car whose longest term is
shorter than the period doesn't cover it.

---

## 11. Who may win

`pickEligible`, `pickWinner`, decision.ts.

### 11.1 Eligibility tiers

Three hard rules, in this order: **gearbox** (a car the reader isn't allowed to drive is no use on any dates)
→ **rental period** (a car that can't be rented for the dates is no use at any price) → **budget** (a car
over budget is still one they could take). Within each, confirmed beats unknown beats ruled out. The pool
is the cars in the best tier.

### 11.2 The winner

The highest-scoring **judgeable** car in the pool; failing that, the pool's best estimate. A winner from
outside "confirmed within budget" is flagged (`isFallback`) and never presented as fitting the budget. Cars
over budget are never hidden — they stay ranked and inspectable.

### 11.3 What could change it

The winner with every unknown at its worst against the runner-up with every unknown at its best
(`dependsOnFor`). Only if the runner-up could then come out ahead is any gap named — and then every gap on
either car, since any could be the deciding one.

---

## 12. What the reader is shown

- **The result card**: the winner, a short "Why" (each thing said → what this car has for it), and "One
  thing to know" (a limit note first, else the biggest trade-off).
- **See why**: **only what the car got right** — everything it has for each thing said, and how what was
  said was weighed. What it lacks and what choosing it gives up are for "The whole case". A thing said that
  the car has nothing for isn't listed as a reason it won.
- **The whole case** (the drawer, fit-story.ts): per need, what the car has and lacks, measurements against
  the scale, CO₂ and efficiency, the cost table with its sources, the rental fit.
- **Chips on finn.com**: each judged car's band; the winner's in gold.
- **Sources**: every figure or rule that isn't FINN's is named and linked where it's said — in the chat's
  "i" tooltips (which wait a moment before closing so a link can be clicked), under the drawer's story and
  cost lines, and at the foot of its environment panel (§13).

---

## 13. Sources register

`lib/sources.ts` holds the links shown to readers. Every figure below was checked in the document itself.

| Source | What Lens takes from it | Where it's used | Checked |
|---|---|---|---|
| [Pkw-EnVKV](https://www.gesetze-im-internet.de/pkw-envkv/) — Germany's CO₂ labelling rules for new cars | The A–G classes as a function of WLTP CO₂ (A = 0, B ≤ 95, C ≤ 115, D ≤ 135, E ≤ 155, F ≤ 175, G above), since the February 2024 amendment | CO₂ scoring; low CO₂ = class A–C; electric = class A = 0 g/km; how-green answers; low-CO₂ row | Classes per §3a; see the emissions document |
| [EEA — CO₂ emissions from new passenger cars](https://www.eea.europa.eu/data-and-maps/data/co2-cars-emission-18) (2025 provisional, release `co2cars_2025Pv31`) | Each registered plug-in's "Electric energy consumption (EC_AC,weighted)", Wh/km | Plug-in electricity cost (§10.3) | Field definition traced to [Regulation (EU) 2019/631](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02019R0631-20240101), Annex III (OVC-HEV: CoC 49.5.2) and [Implementing Regulation (EU) 2020/683](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32020R0683) (CoC 5.2: "Electric energy consumption (EC_AC, weighted)"); Tucson 62 g/2.7 L → 108 Wh/km and X5 74 g/3.2 L → 205 Wh/km matched by hand |
| [European Commission, SWD(2024) 59](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A52024SC0059) — real-world CO₂ emissions gap report | "For the new plug-in hybrid electric cars registered in 2021, the average real-world CO₂ emissions were on average 3.5 times (100 g CO₂/km) higher than their WLTP CO₂ emissions (39.5 g CO₂/km)"; the utility factor changes from 2025 | The plug-in CO₂ note, always with its date | Quoted from the report's text |
| [ICCT, ID 482](https://theicct.org/wp-content/uploads/2025/12/ID-482-%E2%80%93-EEA-briefing-Research-Brief-A4-70179-v7.pdf) — CO₂ from new passenger cars in Europe, 2024 | Combustion cars "have only declined by 3 g/km since 2021, remaining at about 134 g/km" | The 136 g/km comparison point and the combustion efficiency reference | Quoted from the brief |
| [ICCT, ID 392](https://theicct.org/wp-content/uploads/2025/07/ID-392-%E2%80%93-Life-cycle-GHG_report_final.pdf) — life-cycle GHG emissions from passenger cars, 2025 | 16.2 kWh/100 km, sales-weighted official consumption of medium electric cars sold in the EU in 2023 (Table 4) | The 17 kWh/100 km electric efficiency reference | Found in the report |
| [ADAC — "Mit Allradantrieb braucht man keine Winterreifen"](https://www.adac.de/der-adac/regionalclubs/suedbayern/auto-mythen/) | "Beim Anfahren oder beschleunigen hat man eine höhere Traktion" — and "bei einer Bremsung in der Kälte oder auf Schnee hilft kein Allrad"; no substitute for winter tyres | All-wheel drive recommended for snow & ice, said both ways | Quoted from the page |
| [ADAC — "Durch den Winter? Aber sicher!"](https://presse.adac.de/regionalclubs/wuerttemberg/files/adac-infobroschuere-durch-den-winter.pdf) (2015), p. 19 | "in punkto Wintertauglichkeit gibt es zwischen Front- und Heckantrieb keinen eindeutigen Sieger"; with ESP (standard on new cars since 2014) stability and traction problems are largely past | Why Lens doesn't ask about front- vs rear-wheel drive (§15) — not shown to readers | Read in full |

FINN's own API is the source for everything else: `https://www.finn.com/api/cars` (snapshot in
`lib/reasoning-engine/test-data/finn-fleet-snapshot.json`, taken 2026-09-15).

---

## 14. Lens's own assumptions

Numbers with no source to take them from. Each is labelled where it's shown.

| Assumption | Value | Where | Status |
|---|---|---|---|
| Fuel and electricity prices | petrol €1.75/L, diesel €1.70/L, electricity €0.32/kWh (`DEFAULT_PREFERENCES`) | Energy cost; said as "an assumed fuel price of €1.75 per litre" | **Not yet sourced** — see §16 |
| Monthly distance when not asked | 1,000 km | Mileage and energy cost; said as "assumed — you didn't say" | Lens's default |
| Some-give headroom | 15% over the limit (`TARGET_HEADROOM` = 1.15) | Soft budget | Lens's judgement; said with the figure it gives |
| Importance weights | 4 : 2 : 1 (`NEED_WEIGHT`); item raises 2/3/4 on a base of 1 | §3.3, §4 | Lens's design, said in words ("twice as much as") |
| Fit band thresholds | 65 / 45 / 25 | §8 | Provisional, to be recalibrated on FINN's inventory |
| Measurement anchors | §6 | Size, range, charging | Set from FINN's fleet distribution |
| Standard-equipment line | 90% of FINN's cars | §5.2 | Re-checked against the fleet on every calibration run |
| Assessed share | 50% of a priority's weight known | §5.1 | Lens's design |

---

## 15. Decisions considered and rejected

| Considered | Decided | Because |
|---|---|---|
| A "30 kWh/100 km" allowance to bound a plug-in's electricity | **Removed** | It rested on nothing. Real EU data showed it wasn't even a ceiling: 2.8% of plug-ins registered in Germany in 2024, and 2.0% EU-wide, were officially above it. Replaced by each car's EU figure (§10.3). |
| Disqualifying every plug-in under a hard limit, since its cost was never complete | **No** | It would have removed all 44 for any hard budget, including one €400 under an €800 limit. With the EU figure, most are priced in full. |
| Asking about front- vs rear-wheel drive | **No** | The ADAC finds no clear winter winner between them, and with ESP on every new car the difference has largely gone. Rear-wheel drive's better traction when towing is under the same "all else equal" caveat. |
| A "hybrid" fuel choice | **No** | FINN's data has no hybrid type; it files them under petrol. Petrol's "i" says so from the page. |
| "Flexible / Hard line" for deal rows | **Tried, reverted the same day** | "Must be / Mustn't be / Seals it" read better; the meanings now sit under the question instead. |
| An "Electric" deal row | **Replaced** | "What can it run on?" covers it, for all four fuels. |
| "Six seats or more" among who rides with you | **Moved** | It's a count, not a person; it's a deal-breaker or sealer row. |
| Recommending warmth for rain alone | **No** | Rain asks for lights and wipers, not heat. |
| Scoring boot space | **Off** | FINN's figure mixes seats-up and seats-folded. |
| "Starred because studies say…" style claims without a link | **No** | Every non-FINN claim is named and linked, or not made. |

---

## 16. Known gaps and open items

- **Fuel and electricity prices are unsourced assumptions.** They should be sourced (e.g. a published German
  average with its date) and linked like the rest, or the reader asked.
- **A "mustn't" rule lets unknowns through.** Today every mustn't rule is on a field FINN always sends (fuel
  and body type), so no car is affected — but a future mustn't rule on optional equipment should set aside
  unconfirmed cars, as a hard limit does.
- **The EEA's 2025 data is provisional**, and the table needs re-running as FINN adds models: a new plug-in
  model isn't matched until it does. 9 of FINN's 44 plug-ins don't match today (Mazda CX-60 / CX-80, MG S9,
  BMW 330e and two X5 and two Tucson entries).
- **Band thresholds** are provisional (§8).
- **Boot space** waits on a seats-up source (§5.3).
- **Some engine notes predate the chat** and still describe a relative Compare page (fit.ts header); the
  scoring itself is intrinsic (§2).

---

## 17. Refreshing the data

| Data | Script | Then |
|---|---|---|
| FINN's fleet snapshot (tests, calibration) | `node scripts/snapshot-finn-fleet.mjs` | Run the calibration tests; check `BASELINE_PREVALENCE` items still hold |
| EU plug-in electricity table | `node scripts/snapshot-eu-plug-in-electricity.mjs` | Update the release name when the EEA finalises 2025 (`co2cars_2025F…`); re-run `eu-electricity.test.ts`; re-check the match rate |
| Sources | `lib/sources.ts` | Re-open each link; a moved document is a broken claim |
