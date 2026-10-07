# Finn Lens — beta 0.9.0

**Finn Lens** is a browser extension that helps someone choose between FINN car
subscriptions by chatting with it on finn.com. It asks what the car has to do
for them, judges the cars on the page against that, puts its verdict on each
car's card, and explains its pick.

It's **unofficial**: built independently, not by or with FINN. This beta is
for FINN's team to try and react to.

## Install it (Chrome, about two minutes)

1. Unzip `finn-lens-0.9.0-chrome.zip`.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder.
4. Lens opens finn.com in a new tab, and its chat opens by itself. If it
   doesn't, click the **Lens** bubble in the bottom-right corner.

It runs only on `www.finn.com`. Tabs that were already open need a reload.

## Try it (five minutes)

1. On a car listing — apply any filters you like — answer the chat's
   questions. The **i** beside an answer says what it means and what Lens
   checks for it.
2. Read **"Here's what you told me, and what I understood"**. "This doesn't
   look right" opens a panel to correct it.
3. After the judgement, every car on the page wears a chip. Click one for how
   that car fits; click the gold one for why it won, and **Save as PDF**.
4. Try a limit nothing fits — a very low budget, or a long rental — and see
   how Lens says so.

## How it decides

Only from what the reader said, and only on what FINN lists for each car:
equipment, measurements, CO₂ and consumption, prices and terms. Where FINN has
no figure (a plug-in hybrid's electricity use, the CO₂ label's classes), Lens
uses a published European source and links it where it's shown. Its own
assumptions — fuel at €1.75/L, diesel €1.70/L, electricity €0.32/kWh, 1,000 km
a month when the reader doesn't say — are labelled as assumptions.

Every mechanism, number and source is written up in
[`HOW-FINN-LENS-DECIDES.md`](HOW-FINN-LENS-DECIDES.md).

## Data and privacy

- Everything Lens keeps — chats, saved answers, the cars it has read — stays
  in the browser. Settings shows all of it and deletes any of it.
- There's no account and no Lens server. Its only requests are to finn.com —
  for FINN's own API, for cars on the page it hasn't seen yet — and for the
  car photos FINN's data links to.
- No AI model is involved. Typed words are read by fixed keyword rules.

## Known limits

- **Tried in Chrome only.** Firefox is untested.
- **English only**, on finn.com's German pages.
- **It depends on finn.com's pages and data as they are now.** A change to
  either can stop Lens reading cars until it's updated.
- **Typed words are read by keyword rules**, not a model. They understand
  needs, money, distance and deal-breakers, but not dates ("from March"):
  Lens says when it didn't catch something, and every question can be tapped.
- **Costs are estimates**: FINN's price, plus fuel or electricity at the
  assumed prices above, plus the mileage package the distance needs. Parking
  and tolls aren't included.
- **Some things FINN's data can't say aren't judged**: boot space (FINN's
  figure doesn't say whether the seats are up), seat comfort, crash-test
  results.
- In a car's drawer, **"Why it won" names Lens's own categories** (for
  example "city & parking") rather than only the reader's words.

## Feedback

Send anything that looks wrong, unclear or missing to whoever sent you this
build. A screenshot, the finn.com page's address, and what you'd told Lens
make it quickest to trace.
