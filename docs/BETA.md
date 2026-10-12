# Finn Lens — beta 0.9.1

**Finn Lens** is a browser extension that helps someone choose between FINN car
subscriptions by chatting with it on finn.com. It asks what the car has to do
for them, judges the cars on the page against that, puts its verdict on each
car's card, and explains its pick.

It's **unofficial**: built independently, not by or with FINN. This is a beta,
and this build is for its first outside review.

## Install it (Chrome on a computer, about two minutes)

1. Unzip `finn-lens-0.9.1-chrome.zip`. You get a folder holding
   `manifest.json`.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose that folder. Keep the folder where it
   is: Chrome loads Lens from it each time.
4. Lens opens finn.com in a new tab, and its chat opens by itself. If it
   doesn't, click the **Lens** bubble in the bottom-right corner.

It runs only on `www.finn.com`. Tabs that were already open need a reload.
Lens isn't published on the Chrome Web Store; this beta is shared as a package
to load directly. Chrome may warn about extensions in developer mode; that's
expected for a build that isn't from the store.

## Start with the beta guide

Click the Lens icon in Chrome's toolbar (under the puzzle piece, if it isn't
pinned) and choose **Beta guide**. It explains what Lens does, how it decides,
how to read its results, and what this beta can't do yet. It's also a tab in
Lens's Settings, beside a **Product demo** tab that walks through a chat in
screenshots.

## Try it (five minutes)

1. On a car listing — apply any filters you like — answer the chat's
   questions. The **i** beside an answer says what it means and what Lens
   checks for it.
2. Read **"Here's what you told me, and what I understood"**. "This doesn't
   look right" opens a panel to correct it.
3. After the judgement, every car on the page wears a chip. Click one for how
   that car fits; click the gold one for why it won. Every car that wasn't
   ruled out can be saved as a PDF from its drawer.
4. Try a limit nothing fits — a very low budget, or a long rental — and see
   how Lens says so.

## How it decides

Lens compares the cars on the page against the reader's stated needs, preferences and deal-breakers. It uses FINN's vehicle data where available, supplemented by published external reference data for some values, such as plug-in hybrid electricity consumption and German CO₂ classification rules. Lens labels its own estimates and assumptions separately.

For cost estimates, Lens assumes petrol at €1.75/L, diesel at €1.70/L and electricity at €0.32/kWh. It estimates 1,000 km/month if the reader hasn't specified a distance. Mileage packages come from FINN's data, which lists for every car what each package adds to the monthly price — 500 km/month at no extra cost, up to 5,000 km. Lens adds the smallest package that covers the reader's distance, and FINN's per-kilometre price only beyond the largest. For a car whose data doesn't list its packages, Lens assumes 500 km/month is included and says so. Parking and tolls aren't included.

Every mechanism, number and source is written up in
[`HOW-FINN-LENS-DECIDES.md`](HOW-FINN-LENS-DECIDES.md).

## Data and privacy

- Everything Lens keeps — chats, saved answers, the cars it has read — stays
  in the browser, up to the 40 most recent chats. Settings shows all of it and
  deletes any of it, and uninstalling Lens removes it.
- There's no account and no Lens server. Its only requests are to finn.com —
  for FINN's own API, for cars on the page it hasn't seen yet — and for the
  car photos FINN's data links to.
- No AI model is involved. Typed words are read by fixed keyword rules.

## Known limits

The beta guide lists these in full, with what hasn't been checked yet. In
short:

- **Tried in Chrome only.** Firefox and other browsers are untested.
- **English only**, on finn.com's German pages.
- **It depends on finn.com's pages and data as they are now.** A change to
  either can stop Lens reading cars until it's updated.
- **Typed words are read by keyword rules**, not a model. They understand
  needs, money, distance and deal-breakers, but not dates ("from March"):
  Lens says when it didn't catch something, and every question can be tapped.
- **Costs are estimates**: FINN's price, plus fuel or electricity at the
  assumed prices above, plus the mileage package the distance needs. Parking
  and tolls aren't included.
- **Dates count as fixed until the reader loosens them**, and many FINN cars
  are offered only on a 12-month term, so a longer rental can leave few cars.
  Lens then offers the nearest dates a car on the page can be rented for.
- **Some things FINN's data can't say aren't judged**: boot space (FINN's
  figure doesn't say whether the seats are up), seat comfort, crash-test
  results.
- In a car's drawer, **"Why it won" names Lens's own categories** (for example, "city & parking") rather than only the reader's words. A preference marked "Seals it" increases its importance in scoring; it isn't a hard requirement. "Must have" is a hard requirement.
- **Large listings**: on a filtered listing, Lens compares up to about 150 of the matching cars at once. That's Lens's own limit, not FINN's: when more match, it says how many it compared out of how many there are (for example, 150 of the 408 petrol cars). Larger comparisons haven't been tried.
- **Score bands are provisional**: Strong starts at 65/100, Good at 45, Partial at 25, and Limited is below 25. These thresholds may change as the beta is tested.

## How it was built

Finn Lens is an independent project by Orjwan Al-Rajaby. It isn't a FINN
product, and it isn't for sale.

- **Orjwan's work:** the idea and the problem it starts from; investigating
  finn.com — how its pages are rendered, on the server and in the browser, and
  how an extension can work alongside them; working out what each field in
  FINN's car data means; the product's direction and its decision model (what
  Lens asks, what counts, what rules a car out, how much each answer weighs);
  and the first versions — the extension's foundation and its reading of
  FINN's car data (August 2026).
- **Built with Claude Code:** from September 2026, Orjwan directed the
  development with Claude Code, Anthropic's AI coding assistant, which wrote
  most of the code from then on — every commit in this version's history since
  then is marked as co-authored with it. Orjwan decided what to build and what
  to change, and tested it on finn.com.

Lens went through several designs before this one — pinning cars to compare, a
settings screen of priorities, a chat answered by an AI model — before the
guided conversation in this beta.

The code is a beta codebase: it typechecks, has around 950 automated tests,
and was audited for this release, but it grew with the product rather than to
engineering standards set up front, and hasn't had the review a production
product would.

## Feedback and bug reports

Found a bug, an incorrect result, something confusing, or an idea for improvement? Send your report to the person who supplied you with this beta.

You don't need to diagnose the problem. Describe what you were trying to do, what happened, and how someone else could reproduce it.

**What to put in a report**

Your chats are kept only on your computer, so whoever reads your report can't
open them. Lens can only be checked by doing what you did, step by step.
Include whatever you can, in this order:

1. **What kind of issue it is:** a bug (something broke, didn't respond, or
   behaved unexpectedly), or a faulty or incomplete result (a pick or score
   looks wrong, something is missing, or the explanation doesn't match the
   recommendation). Suggestions are welcome too.
2. **Steps to reproduce it:** the full finn.com address you were on, including
   any filters; each answer you gave Lens, in order, tapped or typed; anything
   you changed under "This doesn't look right"; and what you did after the
   result.
3. **What happened:** what Lens showed or did, the car it concerns, and any
   error message.
4. **What you expected,** and why.
5. **Screenshots and the PDF:** screenshots of the chat and the page, and for a
   result, the PDF (click the car's chip, then **Save as PDF** in its drawer).
6. **Anything else that might help:** your browser and its version, and
   anything you noticed along the way. The Lens version is **0.9.1**.

**A useful report doesn't need to be technical.**

For example: "I selected these answers, changed this priority, and expected this car to win, but Lens picked another one. Here's why I expected a different result."

A surprising result is useful even if it isn't a bug. It may reveal a scoring issue, missing data, or a trade-off Lens should explain more clearly.
