# Lens Chat: life bubbles — v2

**Status:** v2 · built on branch `life-bubbles` (from `chat-first`) · **Date:** 1 October 2026 · **Previous:** [v1](LIFE-BUBBLES-SPEC-v1.md)

A shorter Lens chat. The reader taps a few statements about their life, Lens
says what it understood and what it will check, the reader corrects it, and
Lens shows a short result that can be opened up.

---

## What changed from v1

v1 was reviewed. The review liked the bubbles, the deal-breakers and "worth a
look", and objected to how quickly a bubble turned into scoring. v2 keeps the
first three and changes the rest:

| v1 | v2 | Why |
|---|---|---|
| A bubble raised a bundle of features (comforts raised seven). | A bubble counts only its two or three most defensible items. The rest become "worth a look". | "I love my comforts" might mean just heated seats. Tapping a bubble shouldn't claim more than the reader said. |
| Every bubble was "important" unless a follow-up said otherwise, silently. | Every bubble shows how much it counts, in words, on the summary, with one tap to change it. Where a follow-up measures how often, that sets it. | Knowing someone's situation doesn't tell you how strongly they feel about it. A default is fine only if the reader can see it. |
| "Which of these matters most?" when more than three bubbles were picked. | Removed. | It made readers invent a ranking they don't have. |
| Corrections happened a whole bubble at a time. | The summary is where Lens says what it understood. Each checked item can be removed and each suggestion added. | Lens proposes and the reader corrects, without anyone having to learn how the scoring works. |
| Follow-ups were separate questions. | Where the answer changes *what* Lens checks, it's a row of chips that opens under the bubble on the same screen. Only "how often" and "how long" questions are asked separately, and never more than two. | Precision without making the chat longer. |
| Needs Lens can't check were quietly left out. | Each bubble names what FINN's data can't tell Lens ("rear legroom", "whether your child seat fits"). | Start from the reader's life, not from the database, and be honest about where the data stops. |

Unchanged:

- the deal-breakers (§6)
- the weighing arithmetic (§5)
- a folded drawer and a PDF that always has everything (§8)
- Appendix A

## 1. Why

People who tried the chat said two things:

- **The chat is too long.** About twenty questions.
- **The result and its drawer are too wordy.**

The problem isn't that Lens knows too much. **It's that Lens makes everyone
read everything it knows.** The first attempt at a fix, branch `chat-depth`,
asked readers how much Lens should ask and explain. Then it put the engine's
priorities and feature levels in the chat, which made everything but the
quick path longer and more technical.

## 2. Principles

- **The engine decides.** The chat collects what the reader said and hands it
  to the same scoring engine.
- **No AI.** Deterministic mappings only. Typed words are read by the built-in
  keyword reader.
- **Lens proposes, the reader corrects.** A bubble is the start of what Lens
  understands, not a preset. Nothing is weighed that the reader hasn't seen
  on the summary.
- **Situation isn't strength.** "I drive long distances" says what happens,
  not how much it matters. How much comes from a follow-up about how often,
  or from the reader, and it's always shown.
- **Only what Lens can verify.** Every claim traces to FINN's data or to a
  labelled assumption. When a real need can't be checked, Lens says so rather
  than swapping in something nearby.
- **Design from the reader's life, map to the data.** Bubbles and chips are
  written as a person would say them. Anything the data can't back is named
  as unchecked, not left out.
- **The questions have a budget.** A typical chat is about five questions. A
  new idea that adds questions has to replace one.
- **Common sense in what can be picked.** Answers that can't both be true
  exclude each other; limits exist only where "most often" applies.
- **Chips use "&", sentences use "and".**

## 3. The conversation

| # | Step | Counts as a question? |
|---|---|---|
| 1 | **"Tell me about your life. Tap everything that fits."** One screen of bubbles (§4). Some open a row of chips under themselves when tapped ("Where do you park?"). There's also "Something else…" for typed words. | Yes (one) |
| 2 | **Up to two "how often" follow-ups**, only for bubbles where frequency is the whole question: "I drive long distances" and "I sit in traffic a lot". | 0–2 |
| 3 | **Monthly limit and how long.** Plus how far they drive, only if they tapped long distances, traffic or budget. Otherwise the assumed 1,000 km is shown on the summary. | Yes (one screen) |
| 4 | **"Anything that's a deal-breaker?"** Optional (§6). | Yes, skippable |
| 5 | **"Here's what I understood"** (§7). Lens's reading of the reader's life, which they can correct. | No, it's the summary |
| 6 | **Result** (§8). | — |

That's **four to six questions**, against about twenty today. Anything already
said (typed earlier, or kept from saved settings) isn't asked again. "Edit
this answer" stays.

**How much Lens explains** isn't asked. The result is short by default and
"See why →" opens it. If a reader keeps opening it, Lens can open it for them
next time (§8).

## 4. The bubbles

Eleven core bubbles. Each lists:

- **Counts:** what Lens weighs once the bubble is tapped. It's deliberately
  small: the items most people with this life would agree with.
- **Checked:** equipment nearly every FINN car has. It isn't rewarded, but a
  car FINN confirms is missing it loses a little.
- **Chips:** a row that opens under the bubble on the same screen. It changes
  *what* is counted. It's optional: tapping nothing keeps the bubble's own
  items, unless the bubble says otherwise.
- **Asks:** a separate "how often" follow-up that sets how much the bubble
  counts.
- **Worth a look:** suggestions shown on the summary with a "+". They're
  counted only if the reader adds them, and only the ones the cars on the page
  actually differ on.
- **Can't check:** what matters for this life but isn't in FINN's data, said
  on the summary.

Everything under Counts, Checked and Worth a look exists in the engine today
(Appendix A).

### 4.1 "I have kids"

- **Counts:** Rear doors
- **Checked:** ISOFIX child seat anchors
- **Chips:** *A baby or toddler seat* · *A booster seat* · *They're older*
  - baby or toddler seat: it counts as a **must have**, and Electric tailgate joins Worth a look ("so you can open the boot while holding a child")
  - older: 3-zone climate control and Rear USB ports join Worth a look
- **Worth a look:** Split-folding rear seats, and whatever the chips added
- **Can't check:** rear legroom, whether a particular child seat fits, boot space (FINN's figure doesn't say whether the seats are up or folded)

### 4.2 "We need six seats or more"

- **Counts:** Six or more seats, as a **must have**
- **Suggests:** the "Six seats or more" deal-breaker, so five-seaters are set aside rather than just scored lower
- **Can't check:** how usable the third row is for adults

### 4.3 "I travel with a dog"

- **Counts:** Split-folding rear seats
- **Worth a look:** Electric tailgate, Rear doors
- **Can't check:** boot size and shape, how high the boot lip is

### 4.4 "I live in the city"

- **Counts:** Narrow width and Compact length (both measured on a sliding scale, not yes/no)
- **Checked:** Automatic gearbox, Parking sensors, Automatic emergency braking
- **Chips:** "Where do you park most often?", up to two:
  - *On the street* → Reversing camera
  - *A garage at home* → width counts more (checks Electrically folding mirrors)
  - *Multi-storey or underground* → 360° camera (checks Electrically folding mirrors)
  - *Open car parks* → Rear cross-traffic alert
  - *A driveway* → nothing extra
- **Worth a look:** Reversing camera, 360° camera, Blind spot warning (less any the chips already counted)
- **Can't check:** turning circle, how well you can see out

### 4.5 "I want help driving and parking"

- **Chips (pick at least one):** "With what?"
  - *Parking* → 360° camera (checks Parking sensors)
  - *Busy traffic and changing lanes* → Blind spot warning (checks Lane keeping assist)
  - *Reversing out* → Rear cross-traffic alert, Reversing camera
- **Checked:** Automatic emergency braking, Traffic sign recognition
- **Worth a look:** Matrix LED headlights, and the other chips' items
- **Can't check:** crash protection (FINN has no crash-test data)

### 4.6 "I drive long distances"

- **Counts:** Level 2 driver assistance, Lumbar support
- **Checked:** Adaptive cruise control, Cruise control, Built-in navigation
- **Also:** for electric cars, a range below 480 km or a 10–80% DC charge slower than 30 minutes holds the score back. Past those, it makes no difference.
- **Asks:** "How often?"
  - *Every day* or *Every week* → must have
  - *About once a month* → matters
  - *A few times a year* → nice to have
- **Also asks:** how far they drive a month, with the limit (step 3)
- **Worth a look:** Head-up display, Matrix LED headlights, Roof rails
- **Can't check:** seat comfort over hours, road noise, how it rides

### 4.7 "I sit in traffic a lot"

- **Counts:** Level 2 driver assistance (keeps speed, distance and lane together in stop-and-go traffic)
- **Checked:** Automatic gearbox, Adaptive cruise control
- **Asks:** "How long is your drive, one way?"
  - *Under 20 minutes* → nice to have
  - *20–45 minutes* → matters
  - *Over 45 minutes* → must have
- **Worth a look:** Keyless entry & start, Wireless CarPlay / Android Auto, Wireless phone charging
- **Can't check:** how smooth the gearbox is in traffic

### 4.8 "The weather here is tough"

- **Chips (pick at least one):** "What's it like?"
  - *Snow & ice* → Heated seats, Heated steering wheel
  - *Rain & fog* → Rain & light sensors, Fog lights
  - *Cold but mostly dry* → Heated seats
  - *Hot summers* → Ventilated seats
- **Checked:** Air conditioning
- **Worth a look:**
  - With snow & ice: All-wheel drive ("grip pulling away and climbing — it doesn't shorten braking"), Auxiliary heater, Heat pump (electric cars), Headlight washers
  - With hot summers: 3-zone climate control
- **Can't check:** how the car handles on snow
- **Shown, not scored:** which tyres FINN fits — all-season, winter, or a summer and a winter set (see As built)

### 4.9 "I drive at night a lot"

- **Counts:** Matrix LED headlights, Cornering lights
- **Worth a look:** Headlight washers, Rain & light sensors, Fog lights
- **Can't check:** how bright the headlights are, beyond their type

### 4.10 "I carry a lot"

- **Chips (pick at least one):** "What do you carry?"
  - *Big or bulky things* → Split-folding rear seats
  - *Bikes, skis or a roof box* → Roof rails
  - *A trailer or caravan* → Towbar, Tows 1,500 kg or more. Suggests the "Must tow" deal-breaker.
- **Worth a look:** Electric tailgate (bulky things), Towbar (bikes: a rack can go on it)
- **Can't check:** boot space (FINN's figure is ambiguous)

### 4.11 "Comfort matters to me"

- **Chips (pick any):** "Which comforts?"
  - *Warm seats* → Heated seats
  - *Keyless entry* → Keyless entry & start
  - *Phone without cables* → Wireless CarPlay / Android Auto, Wireless phone charging
  - *Everyone sets their own temperature* → 3-zone climate control
  - *Electric seats* → Electric front seats
  - *Good sound* → Premium sound system
  - *A sunroof* → Sunroof
- **Counts:** only what's picked. With nothing picked, it counts nothing and the summary shows the comforts as Worth a look ("Tell me which, and I'll count them").
- **Checked:** Apple CarPlay / Android Auto
- **Can't check:** how comfortable the seats are, how quiet the cabin is

### 4.12 "I care about the environment"

- **Counts:** Environmental Impact, the car's own CO₂ figure on the EU A–G scale. There's no equipment.
- **Chips:** "How much?" *It could decide it* (must have) · *It matters* · *A bonus* (nice to have)
- **Suggests:** the "Low CO₂ only (class A–C)" deal-breaker
- **Can't check:** emissions over the car's whole life or from making the electricity, or how much of a plug-in hybrid's driving its figure takes to be on electricity — FINN doesn't say.

### 4.13 "I'm on a budget"

- **Always asks the limit** (step 3). A chip on the limit, *Nothing over it*, makes it a deal-breaker.
- **Counts:** Efficiency, how little fuel or electricity the car uses against others of its kind. That feeds the running cost.
- **Needs a decision:** see §9, question 1. Today price is a limit, not a score.

### 4.14 Other candidates

Not in the core eleven. Add them only if testers miss them:

- **"I often drive other adults around"**: 3-zone climate control, Rear USB ports
- **"Safety comes first"**: Safety & Driver Assistance as a must have

## 5. Weighing it

The **chat-first** model:

- **How much each bubble counts:** *Must have* 4 · *Matters* 2 · *Nice to have* 1.
  - It's set by the "How often" answer or the bubble's chips.
  - Otherwise it starts at *Matters*, shown on the summary with one tap to change.
  - Never silent.
- **A priority's weight** is the sum of the bubbles that reach it.
- **Only counted items count.** A priority isn't also judged on everything else in it. Measured items (length, width) count on a sliding scale.
- **Item level follows the bubble:** Must have → Highly, Matters → Moderately, Nice to have → Somewhat. These words appear only in the drawer's "How I weighed it".
- **Once only:** an item counted by two bubbles counts once, at the higher level.
- **Rules can't be raises:** an item that's also a deal-breaker isn't counted, because every car left has it.
- **Removed items stay removed** for that bubble. If they're saved as settings, they stay removed in new chats too.

## 6. Deal-breakers (rules)

Unchanged from v1. These set cars aside before ranking. Only rules that split the cars on the page are offered.

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

## 7. "Here's what I understood"

This summary is where Lens's reading gets corrected. One block per bubble, for example (illustrative):

```text
You have kids · a baby or toddler seat              Must have ▾
  I'll check   Rear doors ×   ISOFIX ✓ (nearly every car has it)
  Might matter + Split-folding rear seats   + Electric tailgate
  I can't check rear legroom, or whether your child seat fits.

You live in the city · you park on the street       Matters ▾
  I'll check   Narrow width ×   Compact length ×   Reversing camera ×
  Might matter + 360° camera   + Blind spot warning
  I can't check the turning circle.
```

- **×** takes an item out; **+** adds a suggestion. It counts at the bubble's level.
- **The ▾ menu** sets how much the bubble counts: Must have · Matters · Nice to have.
- **Below the bubbles:** monthly limit, how long, distance (or "about 1,000 km — assumed"), and deal-breakers, each with "Change".
- **"Looks good to me — let's go"** judges. Then "Keep these as your settings, or just for this chat?".

There are no priority names, percentages or Standard/Somewhat/Moderately/Highly
here. Those are in the drawer.

## 8. The result and the drawer

**Result card in the chat, default** (the car and figures are illustrative):

```text
Your strongest match
Škoda Karoq                               €XXX a month, estimated

Why
  You park on the street  →  4.2 m long, reversing camera
  You have a toddler      →  rear doors, ISOFIX
  You drive long distances →  level 2 driver assistance

One thing to know
  It's €44 a month more than the MG S5.

See why →
```

- **Why:** one line per bubble for up to three bubbles, each naming what this car has. Only what it has; gaps go to "One thing to know" or the drawer.
- **One thing to know:** the biggest trade-off, or a limit note (over budget, nothing fits the dates, every car broke a rule).
- **See why →** opens the rest in place: every reason, all trade-offs, the next three closest, and "Because you said…" (which bubbles put weight where).
- **Remembering:** if the reader opens "See why" on two results in a row, later results open that way too. "Keep it short" puts it back.

**Drawer:**

- **Open by default:** why it won, and what it costs.
- **Folded, one tap each:**
  - How it fits what you told me
  - What you'd give up
  - Why not the others
  - How I weighed it (priorities, shares, and each item's level)
  - Costs of use (fuel, mileage)
- **Save as PDF** always has everything.

## 9. Open questions

1. **Does "I'm on a budget" need a cost score?** Today price is only a limit.
   - Option A (no engine change): the limit plus Efficiency.
   - Option B: a new "Value" priority where a cheaper monthly estimate scores higher. That's new engine work.
2. **Is "Matters" the right default?** Or should a bubble with no "how often" answer start at *Nice to have*, so that importance is only ever raised by something the reader said?
3. **How many passengers?** Today it's a question and decides seats and doors. Here it's implied by "I have kids" and "six seats". Is that enough, or does "I have kids" need a *How many?* chip?
4. **Night driving and weather:** two bubbles, or one "Dark roads & bad weather"?
5. **Chips under bubbles:** does one screen stay readable when three or four bubbles have opened their chips? Worth a paper prototype before building.
6. **Removed items in saved settings:** keep them removed in new chats (as proposed), or start fresh each time?
7. **Branch:** build from `chat-first` (its scoring suits this). From `chat-depth`, bring over only "See why / Show me more".

### As built

How the open questions were settled on `life-bubbles`, each the lean the spec already had:

1. **Budget:** option A — the limit (always asked), "Nothing over it" as a deal-breaker, and Efficiency. No new engine score.
2. **Default:** *Matters*, shown on the summary as Lens's guess with one tap to change it.
3. **Passengers:** no count question; "I have kids" counts rear doors, "We need six seats or more" six seats.
4. **Night and weather:** two bubbles.
5. **Chips under bubbles:** built; worth the paper prototype still, with real readers.
6. **Removed items:** stay removed, in saved settings too.

Changed after trying it (5 October 2026):

- **Bubbles in four sections**, one screen each, rather than all thirteen at once: who rides with you; where and how you drive (how often follows straight after); what the car has to cope with; what else matters. More screens, each one short.
- **"Select all / Unselect all"** on chip rows where several can be true and there's no limit; it never picks two that can't both be true.
- **What you carry:** "Shopping & everyday bags" (electric tailgate) apart from "Bulky things: furniture, a pram, sports kit" (split-folding seats).
- **Comfort:** every comfort FINN lists that Lens can score, by its name — heated seats and steering wheel, ventilated seats, pre-heating, keyless entry & start, wireless CarPlay / Android Auto, wireless charging, 3-zone climate, electric seats, lumbar support, premium sound, sunroof, rear USB ports, head-up display. Leather seats and ambient lighting are said not to count.
- **The environment:** "How big a part should CO₂ play in my pick?" — a big part · as much as my other needs · a small part.
- **A budget:** "A hard limit: nothing over it" (cars over it set aside) or "Some give: a little over is fine" (up to about 15% over still counts — the engine's own soft limit). The limit question is "all costs together", and says what that is.
- **From when:** after how long — the soonest (next month) and the three after, or later.
- **Deal-breakers in sections:** from what you told me, money, fuel & emissions, the car itself.
- **Contradictions ruled out:** ~~mostly dry weather beside rain or snow~~ (since 7 October 2026 "Cold & dry" is **Cold winters**, wet or dry, and combines with rain; snow counts the cold itself), "no fixed limit" after "I'm on a budget", a few hundred km a month after long drives every day, an item counted twice, a heat pump suggested to someone who won't go electric.

Changed after trying it again (5 October 2026):

- **Deal-breakers & deal-sealers** replace the deal-breakers question: a row per thing, each set to Doesn't matter, a deal-breaker (must / mustn't — a rule, as before) or a deal-sealer (counts as a must have, sets nothing aside). Rows offer only what Lens can do: no "electric seals it", since being electric is ruled on, not scored.
- **Short labels, tooltips:** bubbles and chips have short labels ("Kids", "In the city", "Bulky things", "Hard limit"); the "i" is a tooltip with a brief explanation and what Lens checks, instead of a card opening under the chips.
- **Who rides with you:** kids, adults (beside you asks nothing extra; in the back counts rear doors) and a dog. "Six seats or more" moved to deal-breakers & sealers.

- **Recommended from what you said:** comfort chips that earlier answers point to are starred and come first, and their "i" says why — "Recommended because you said winters bring snow and ice, and you spend a lot of time on the road." Never picked for the reader; a bubble's own answers never recommend its own chips. Rain alone doesn't recommend warmth, and time on the road only adds to a heated wheel beside a cold-weather reason.

- **One scale for how much something counts** (6 October 2026): *Top priority · Important · Nice to have* (4 · 2 · 1, unchanged) replaces *Must have · Matters · Nice to have* and the CO₂ question's "a big part / as much as the rest / a small part". Each says what it means — Top priority counts twice as much as Important, Important twice as much as Nice to have — and a deal-sealer counts as a top priority. "Must have" now only ever means a deal-breaker, which rules cars out; none of the levels does.

- **How green, not how much** (6 October 2026): the environment asks "How green should the car be?" — *Clean for its fuel type* (judged on consumption against cars on the same fuel, so a frugal petrol scores well; suggests nothing), *Moderately green* (the CO₂ label, where plug-in hybrids usually sit; suggests low CO₂ as a deal-breaker) or *Totally green* (the CO₂ label as a top priority, where electric is 0 g/km on the road; suggests electric as a deal-breaker). How much it counts is the one scale on the summary.
- **Deal rows keep Must be / Must have / Mustn't be / Seals it** (tried as "Flexible / Hard line" and reverted the same day), each option's meaning on hover; a row Lens can only rule on says it can't seal the deal. "Low CO₂ (class A–C)" is called **Low CO₂ emissions**, with the class in its "i".

- **What it runs on, and plug-in hybrids** (6 October 2026): "What can it run on?" — electric, plug-in hybrid, petrol, diesel, any or all — is asked before deal-breakers, and replaces the Electric deal row. FINN lists every plug-in hybrid (44 of 728) with one combined litres figure and no electricity figure, so its electricity is the EU's official figure for the same car, from the EEA's registration data, matched on make, model, CO₂ and fuel figure, with the source linked and the caveat that both figures assume the EU test's mix of driving. Where nothing matches, it's named as missing — and under a hard limit, a car that can't be confirmed is set aside, saying exactly what's missing.
- **"See why" is what the car got right**: everything it has for each thing said, and how it was weighed. Gaps and trade-offs are in "The whole case".
- **Checked against FINN's raw responses** (7 October 2026): six pages of `/api/cars` as finn.com sent them, 127 cars. Tyres are FINN's own field, so §4.8 no longer lists them as something Lens can't check: FINN fits all-season tyres (110 of the 127), winter tyres (13) or a summer and a winter set (4), and the drawer says which — winter tyres had been read as "FINN doesn't say". An early-booking car is quoted at the discounted price from FINN's price list rather than the price before the discount (5 cars, €10 a month each), which is what finn.com's own cards charge. An electric car's range, which FINN sends as text, now reaches everything that reads it. FINN's data-audit notes ("Audit override: hasLeatherSeats") are taken out of the equipment text before the model reads it. The details are in [How FINN Lens decides §2.1](HOW-FINN-LENS-DECIDES.md#21-reading-finns-data).

Two things the spec promised needed engine or flow changes to be true:

- **"Checked" items** (§4) did nothing in the chat's ask-only scoring unless a need named them, and a named one was rewarded like a raise. The engine now takes them as `preferences.checked`: a car FINN confirms is missing one loses a little, having one earns nothing.
- **A bubble a deal-breaker fully settles** — six seats beside "Six seats or more" — leaves no need behind, so the story doesn't repeat the rule as a need; the summary says the rule settles it.

---

## Appendix A: everything Lens takes into account today

Unchanged from v1.

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

- **FINN's monthly price** on the term that covers the reader's period (or FINN's default term), with nothing paid upfront, as FINN's current price list gives it — on an early-booking offer, the discounted price.
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
  - Which tyres FINN fits: all-season, winter, or a summer and a winter set
- **Figures:** boot space (ambiguous), electric range as a figure
- **Used only by rules:** electric (fuel type), SUV (body), CO₂ class A–C, frugal for its kind

### A.11 Fit bands

Each car gets **Strong**, **Good**, **Partial** or **Limited match**, or "not enough data" when FINN lacks what's needed. The band is worked out from how much of what the reader asked for FINN lists on the car, and from its CO₂ or consumption where those count.
