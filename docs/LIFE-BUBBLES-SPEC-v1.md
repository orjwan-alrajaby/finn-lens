# Lens Chat: life bubbles — v1

**Status:** v1, superseded by [v2](LIFE-BUBBLES-SPEC-v2.md) · proposal, not built · **Date:** 1 October 2026

> Kept for reference. v2 answers a review of this version: smaller bundles
> per bubble, no "which matters most?", importance that's visible and
> correctable instead of assumed, corrections in the summary, and needs Lens
> can't check named as such. See "What changed from v1" in v2.

A shorter Lens chat. The reader taps a few statements about their life
("I have kids", "I drive long distances"), Lens works out what that means for
a car, and it shows a short result that can be opened up.

---

## 1. Why

People who tried the chat said two things:

- **The chat is too long.** About twenty questions, asked one group at a time.
- **The result and its drawer are too wordy.**

A first answer (branch `chat-depth`) asked the reader how much Lens should ask
and explain, then brought Lens's priorities and feature levels into the chat.
It fixed the length for "quick" readers and made everything else longer and
more technical: two questions about questions before anything useful, the
engine's category names ("Climate Suitability") in the conversation, and a
form-like card of four-way switches per feature.

This proposal goes the other way: **fewer, broader questions in the reader's
own words, with Lens doing the translation.**

## 2. Principles (unchanged)

- **The engine decides.** The chat only collects what the reader said and
  hands it to the same scoring engine. No second brain.
- **No AI.** Deterministic mappings only: no LLMs, embeddings or generated
  questions. Typed words are still read by the built-in keyword reader.
- **Only what Lens can verify.** Every claim traces to FINN's data or to a
  labelled assumption. Present values are facts; "not enough data" only when a
  value is missing.
- **Common sense in what can be picked.** Answers that can't both be true
  exclude each other; limits exist only where "most often" applies.
- **Chips use "&", sentences use "and".**

## 3. The conversation

| # | Step | Notes |
|---|---|---|
| 1 | **"Tell me about your life. Tap everything that fits."** | One screen of bubbles (§4), multi-select, plus "Something else…" for typed words. |
| 2 | **Up to two follow-ups** | Only for bubbles where the answer changes what Lens checks (§4 lists them). Never more than two in total: the most decisive ones first. |
| 3 | **"Which of these matters most?"** | Only if more than three bubbles were picked. One tap, among the reader's own bubbles. Optional ("They matter equally"). |
| 4 | **Monthly limit, and how long** | "What's the most you'd spend a month?" and "How long do you need the car?" Both have "No fixed limit" / "Not sure yet". |
| 5 | **"Anything that's a deal-breaker?"** | Optional, one question: the rules in §6. |
| 6 | **Summary: "Here's what I'll look for, because you said…"** | Each bubble with the equipment it checks, the limits, and "Change" beside each. "Looks good to me — let's go". |
| 7 | **Result** | Short card, "Show me more" (§8). |

A reader who taps three bubbles and has a budget answers **about five
questions**. The current chat asks about twenty.

Anything already said (typed earlier, or kept from saved settings) isn't asked
again. "Edit this answer" on the last answer stays.

## 4. The bubbles

Eleven core bubbles, in the order shown. Each lists:

- **Counts:** the priorities it puts weight on, and the features it raises.
  A feature's level follows the bubble's importance: a must-have bubble raises
  its features *Highly*, an important one *Moderately*, a bonus *Somewhat*.
  Unless a follow-up says otherwise, a bubble is **important**.
- **Checked:** equipment nearly every FINN car has. It isn't rewarded, but a
  car FINN confirms is missing it loses a little.
- **Follow-up:** asked only if it's among the two most decisive (§3).
- **Worth a look:** equipment related to the bubble that the cars on the page
  differ on. It's shown in the summary as a suggestion, counted only if the
  reader taps it.

Everything named here exists in the engine today (appendix A). The mappings
come from the current needs (`lib/lens-chat/guide.ts`) and follow-ups
(`lib/chats/follow-ups.ts`), merged where a bubble covers several needs.

### 4.1 "I have kids"

- **Counts:** Practicality, Comfort
  - Rear doors
  - Split-folding rear seats
  - Rear USB ports
- **Checked:** ISOFIX child seat anchors
- **Follow-up:** "Does the youngest ride in a child seat?"
  - *A baby or toddler seat* → must-have, and adds Electric tailgate ("so you can open the boot while holding a child or a pram")
  - *A booster seat* → as above, no additions
  - *No, they're older* → adds 3-zone climate control ("so children in the back can set their own temperature")
- **Worth a look:** Electric tailgate, 3-zone climate control

### 4.2 "We need six seats or more"

- **Counts:** Practicality: Six or more seats (niche: only counts when raised), Rear doors
- **Must-have** by default.
- Offer it as a deal-breaker too ("Six seats or more", §6).

### 4.3 "I travel with a dog"

- **Counts:** Practicality
  - Electric tailgate
  - Split-folding rear seats
  - Rear doors

### 4.4 "I live in the city"

- **Counts:** City & Parking, Safety & Driver Assistance
  - Narrow width (measured)
  - Compact length (measured)
  - Reversing camera
  - Blind spot warning
- **Checked:** Automatic gearbox, Parking sensors, Automatic emergency braking, Traffic sign recognition
- **Follow-up:** "Where do you park most often?" (pick up to two)
  - *On the street* → Compact length, Reversing camera, 360° camera
  - *A garage at home* → Narrow width, Compact length (checks Electrically folding mirrors)
  - *Multi-storey or underground car parks* → Narrow width, 360° camera (checks Electrically folding mirrors)
  - *Open car parks* → Rear cross-traffic alert, Reversing camera
  - *A driveway* → nothing extra

### 4.5 "I want help driving and parking"

*(The user's "I need driving & parking assistance". Merges today's "Driving makes me nervous" and "Safety features".)*

- **Counts:** Safety & Driver Assistance, City & Parking
  - Blind spot warning
  - Rear cross-traffic alert
  - 360° camera
- **Checked:** Parking sensors, Lane keeping assist, Automatic emergency braking, Traffic sign recognition
- **Follow-up:** "What would you most like help with?" (multi)
  - *Parking* → 360° camera, Parking sensors
  - *Busy traffic and changing lanes* → Blind spot warning, Lane keeping assist
  - *Reversing out* → Rear cross-traffic alert, Reversing camera
- **Worth a look:** Matrix LED headlights

### 4.6 "I drive long distances"

- **Counts:** Long Distance Travel, Practicality
  - Level 2 driver assistance
  - Lumbar support
  - Head-up display
  - Split-folding rear seats (road trips)
  - Roof rails (road trips; niche)
- **Checked:** Adaptive cruise control, Cruise control, Built-in navigation
- **Also:**
  - For electric cars, a range below 480 km or a 10–80% DC charge slower than 30 minutes limits the Long Distance score. Past those, it makes no difference.
  - Matrix LED headlights count here at standard.
- **Follow-up:** "How often?"
  - *Every day* or *Every week, or most weekends* → must-have
  - *About once a month* → important
  - *A few times a year* → bonus
- **Also asks:** "How far do you drive a month?" (500 / 1,000 / 1,500 / 2,500+ km, or a number). This feeds the costs: fuel or charging, and the FINN mileage package, since FINN's price includes 500 km a month.
- **Worth a look:** Matrix LED headlights, Blind spot warning

### 4.7 "I sit in traffic a lot"

*(The user's note: "long distances can mean a good amount of time in traffic". Kept as its own bubble, because a short city commute and a motorway trip want different things.)*

- **Counts:** Long Distance Travel, Comfort
  - Keyless entry & start
- **Checked:** Adaptive cruise control, Automatic gearbox, Apple CarPlay / Android Auto
- **Follow-up:** "How long is your commute, one way?"
  - *Under 20 minutes* → bonus
  - *20–45 minutes* → important
  - *Over 45 minutes* → must-have
- **Worth a look:** Wireless CarPlay / Android Auto, Wireless phone charging, Level 2 driver assistance

### 4.8 "The weather here is tough"

- **Follow-up (always):** "What's it like?" (multi)
  - **Snow & ice** → must-have. Counts Heated seats, Heated steering wheel, All-wheel drive (niche; "for grip pulling away and climbing — it doesn't shorten braking"), Auxiliary heater, Rain & light sensors, Fog lights.
  - **Rain & fog** → Rain & light sensors, Fog lights.
  - **Cold but mostly dry** → Heated seats, Heated steering wheel.
  - **Hot summers** → Ventilated seats, 3-zone climate control.
- **Priority:** Climate Suitability (and Comfort for hot summers)
- **Checked:** Air conditioning
- **Worth a look:**
  - Heat pump (electric cars)
  - Auxiliary heater
  - All-wheel drive
  - Headlight washers

### 4.9 "I drive at night a lot"

- **Counts:** Safety & Driver Assistance, Climate Suitability
  - Matrix LED headlights
  - Cornering lights
  - Rain & light sensors
  - Fog lights
- **Worth a look:** Headlight washers

### 4.10 "I carry a lot"

- **Follow-up (always):** "What do you carry?" (multi)
  - *Big or bulky things* → Split-folding rear seats, Electric tailgate
  - *Bikes, skis or a roof box* → Roof rails, Towbar (both niche)
  - *A trailer or caravan* → Towbar, Tows 1,500 kg or more (both niche). Suggest the "Must tow" deal-breaker.
- **Priority:** Practicality
- **Worth a look:** Towbar, All-wheel drive and 360° camera (when towing)

### 4.11 "I love my comforts & tech"

*(The user's "creature comforts". Takes in today's "Everyday comfort", "Phone connection" and "Adult passengers".)*

- **Counts:** Comfort, Climate Suitability
  - Electric front seats
  - Keyless entry & start
  - Wireless phone charging
  - 3-zone climate control
  - Wireless CarPlay / Android Auto
  - Premium sound system
  - Heated seats (somewhat)
- **Checked:** Apple CarPlay / Android Auto
- **Worth a look:**
  - Sunroof
  - Rear USB ports
  - Ventilated seats
  - Heated steering wheel

### 4.12 "I care about the environment"

- **Counts:** Environmental Impact. It's scored on the car's own CO₂ figure (g/km) on the EU A–G scale: A 0, B up to 95, C 115, D 135, E 155, F 175, G above. There's no equipment.
- **Follow-up:** "How much should it count?"
  - *It could decide it* → must-have
  - *It matters* → important
  - *A bonus* → bonus
- **Suggests:** the "Low CO₂ only (class A–C)" deal-breaker.
- **Caveat:** a plug-in hybrid's low figure assumes regular charging. Lens says so.

### 4.13 "I'm on a budget"

This one is a limit more than a need, so it works differently:

- **Always asks the monthly limit** (step 4), and offers "Nothing over my limit" as a deal-breaker, which sets over-limit cars aside rather than grading them.
- **Counts:** Efficiency, which is how little fuel or electricity the car uses against others of its kind: petrol against about 5.8 L/100 km, diesel about 5.2 L/100 km, electric 17 kWh/100 km. A plug-in hybrid isn't judged, because FINN's single figure mixes fuel and electricity. Consumption feeds the running cost too.
- **Needs a decision:** see open question 1 in §9. The engine has no "cheaper is better" score today: price is a limit, not a priority.

### 4.14 Other candidates

Not in the core eleven. Add them only if testers miss them:

- **"I often drive other adults around"**: 3-zone climate control, Rear USB ports (now under comforts)
- **"Safety comes first"**: Safety & Driver Assistance as a must-have (now under 4.5)

## 5. Weighing it

The **chat-first** model, not the ranked-priorities model from `chat-depth`:

- **Weights:**
  - Each bubble is a need with an importance: must-have 4, important 2, bonus 1.
  - A priority's weight is the sum of the needs that reach it.
  - "Which matters most?" makes the chosen bubble a must-have.
- **What counts:**
  - Only the features the reader's bubbles name count. A priority isn't also judged on everything else in it.
  - Measured properties (length, width) count on a sliding scale, not yes/no.
- **Once only:** a feature named by two bubbles counts once, at the higher level.
- **Rules can't be raises:** a feature that's also a deal-breaker isn't raised, because every car left has it.
- **Worth a look:** counted only when the reader taps it.

## 6. Deal-breakers (rules)

These set cars aside before ranking. Only rules that split the cars on the page are offered.

| Rule | Reads |
|---|---|
| Electric only / Not electric | Fuel type |
| Automatic only | Gearbox |
| No SUV | Body type |
| Must tow | Towbar |
| Six seats or more | Seat count |
| All-wheel drive | Drive type |
| Four doors or more | Door count |
| Low CO₂ only (class A–C) | CO₂ g/km |
| Frugal for its kind only | Consumption against its benchmark |
| Nothing over my limit | Monthly estimate against the limit |

If every car breaks a rule, Lens judges them all as if the rules weren't there, and says so.

## 7. The summary

"Here's what I'll look for, because you said…"

- Each bubble in the reader's words, with the equipment it checks.
- Worth-a-look suggestions as tappable chips.
- Monthly limit, how long, distance (or the assumption used), and deal-breakers.
- "Change" beside every line; "Looks good to me — let's go" to judge.
- Then "Keep these as your settings, or just for this chat?".

No priority names, percentages or influence levels on the summary. Those live
in the drawer's "How I weighed it".

## 8. The result and the drawer

**Result card in the chat (default):**

- The pick, its photo and its estimated monthly cost
- Two reasons, each tied to a bubble ("You said you park on the street — it has a 360° camera and is 4.2 m long")
- One trade-off ("€44/month more than the MG S5")
- A limit note, only when it applies (over budget, nothing fits the dates)
- **Show me more →** opens every reason, all trade-offs, the next three closest cars, and "Because you said…" (which bubbles put weight where)

**Drawer:**

- **Open by default:** why it won (reasons) and what it costs.
- **Folded, one tap each:**
  - How it fits what you told me
  - What you'd give up
  - Why not the others
  - How I weighed it (priority shares and what counted more)
  - Costs of use (fuel, mileage)
- **Save as PDF** always includes everything.

## 9. Open questions

1. **Does "I'm on a budget" need a cost score?** Today price is only a limit.
   - Option A (no engine change): limit plus Efficiency.
   - Option B: a new "Value" priority where a cheaper monthly estimate scores higher. That's new engine work and changes results for everyone who taps it.
2. **Bubble importance by default.** Everything is "important" unless a follow-up or "matters most" says otherwise. Is one "matters most" enough, or should the summary keep the must-have / important / nice-to-have toggle per bubble? It's one tap each and costs no questions.
3. **How many passengers?** Today it's its own question and decides seats and doors. Here it's implied by "I have kids" and "six seats". Is that enough?
4. **Night driving and weather:** two bubbles, or one "Dark roads & bad weather"?
5. **Branch:** build from `chat-first` (its scoring suits this); bring over only "Show me more" from `chat-depth`.

---

## Appendix A: everything Lens takes into account today

From `lib/reasoning-engine/constants.ts` and `lib/lens-chat/evidence.ts`, as
of this date.

- **Raisable:** a reader or a bubble can make it count more (Somewhat 2×,
  Moderately 3×, Highly 4× a standard item).
- **Niche:** not counted at all until raised.
- **Checked:** nearly every car has it; it isn't rewarded, but a confirmed
  miss costs a little.

### A.1 Safety & Driver Assistance

| Item | Kind |
|---|---|
| Blind spot warning | Raisable |
| Rear cross-traffic alert | Raisable |
| Matrix LED headlights | Raisable (also counts under Long Distance at standard) |
| Automatic emergency braking | Checked |
| Lane keeping assist | Checked |
| Traffic sign recognition | Checked |
| Emergency call system (eCall) | Checked |
| Tyre pressure monitoring | Checked |

Crash protection isn't in FINN's data.

### A.2 City & Parking

| Item | Kind |
|---|---|
| Compact length | Raisable, measured: 4.0 m or shorter scores full, 4.3 m 80%, 4.6 m 55%, 4.9 m 30%, 5.2 m and longer nothing |
| Narrow width | Raisable, measured: 1.75 m or narrower full, 1.85 m 70%, 1.95 m 35%, 2.05 m and wider nothing |
| Reversing camera | Raisable |
| 360° camera | Raisable |
| Parking sensors | Checked |
| Parking assistant | Checked |
| Electrically folding mirrors | Checked |
| Automatic gearbox | Checked |

### A.3 Practicality

| Item | Kind |
|---|---|
| Rear doors | Raisable (from FINN's door count) |
| Five or more seats | Raisable (from seat count) |
| Split-folding rear seats | Raisable |
| Electric tailgate | Raisable |
| Towbar | Niche |
| Tows 1,500 kg or more | Niche (braked towing rating) |
| Roof rails | Niche |
| Six or more seats | Niche |
| ISOFIX child seat anchors | Checked |

Boot space isn't scored: FINN's figure sometimes means seats up and sometimes folded, without saying which.

### A.4 Long Distance Travel

| Item | Kind |
|---|---|
| Level 2 driver assistance | Raisable (FINN's assistance level) |
| Lumbar support | Raisable |
| Head-up display | Raisable |
| Spare wheel | Niche |
| Matrix LED headlights | Counted here at standard (home: Safety) |
| Cruise control | Checked |
| Adaptive cruise control | Checked |
| Built-in navigation | Checked |
| Electric range | Limit, electric only: below 480 km holds the score back |
| DC charging time (10–80%) | Limit, electric only: slower than 30 min holds the score back |

### A.5 Climate Suitability

| Item | Kind |
|---|---|
| Heated seats | Raisable |
| Heated steering wheel | Raisable |
| Rain & light sensors | Raisable |
| Cornering lights | Raisable |
| Ventilated seats | Raisable |
| Fog lights | Raisable |
| Auxiliary heater | Raisable |
| Headlight washers | Raisable |
| Heat pump | Raisable (matters for electric cars) |
| All-wheel drive | Niche |
| Air conditioning | Checked |

### A.6 Comfort

| Item | Kind |
|---|---|
| Wireless phone charging | Raisable |
| Keyless entry & start | Raisable |
| Premium sound system | Raisable |
| 3-zone climate control | Raisable |
| Electric front seats | Raisable |
| Wireless CarPlay / Android Auto | Raisable |
| Sunroof | Raisable |
| Rear USB ports | Raisable |
| Apple CarPlay / Android Auto | Checked |

### A.7 Environmental Impact (a figure, no equipment)

- The car's reported CO₂ in g/km, placed on the EU A–G classes: A 0, B up to 95, C 115, D 135, E 155, F 175, G above.
- Emissions while driven only, not the car's whole life.
- Plug-in hybrids are flagged: their figure assumes regular charging.

### A.8 Efficiency (a figure, no equipment)

- The car's reported consumption against a benchmark for its own kind:
  - petrol about 5.8 L/100 km
  - diesel about 5.2 L/100 km
  - electric 17 kWh/100 km
- These are derived from the 136 g/km new-combustion-car average, and a rounded mid-size EV figure.
- Plug-in hybrids aren't judged.

### A.9 Cost (every car, always)

- **FINN's monthly price** on the term that covers the reader's period (or FINN's default term).
- **Fuel or charging** at an assumed price: petrol €1.75/L, diesel €1.70/L, electricity €0.32/kWh. This is labelled as an assumption, not a quote.
- **The FINN mileage package** the stated distance needs. FINN's price includes 500 km a month; if the reader doesn't say, Lens assumes 1,000 km and says so.
- **Nothing else:** parking and tolls aren't included.
- **Missing costs:** a line Lens can't estimate is left out of the total and named, never counted as €0.

### A.10 Read, but not scored

Shown in the drawer or used only for rules:

- **Equipment:**
  - LED headlights
  - Privacy glass
  - Leather seats
  - Ambient interior lighting
  - Front USB ports
  - Start/stop system
  - Electric parking brake
  - Alloy wheels
  - Hill start assist
  - All-season or winter tyres
- **Figures:** boot space (ambiguous), electric range as a figure
- **Used only by rules:** electric (fuel type), SUV (body), CO₂ class A–C, frugal for its kind

### A.11 Fit bands

Each car gets **Strong**, **Good**, **Partial** or **Limited match**, or "not enough data" when FINN lacks what's needed. The band is worked out from how much of what the reader asked for FINN lists on the car, and from its CO₂ or consumption where those count.
