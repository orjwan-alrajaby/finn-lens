# Future: the shortlist

> **Status:** agreed, not built. Written down on 2026-09-29 so it can be picked up after the chat work. Nothing here exists in the code yet.

## Why it's needed

A chat judges the cars on one finn.com page. A reader usually runs several searches: different filters, maybe different answers. Each search produces its own pick, and none of them is compared with the others. Five searches can leave a reader with five "best" cars from five different lists and no way to tell which is best overall. The way people settle that is by elimination: keep the ones worth keeping, then weigh them against each other.

Lens can't do that for them in one pass, because it can only see what FINN's page shows it. It has neither FINN's whole catalogue nor a way to apply FINN's filters and the reader's answers together. The shortlist is the reader's own answer to that gap.

The reader may also want to show the shortlist to someone else: a partner, or whoever is paying half.

## What the reader can do

1. **Pin a car to their shortlist, from a drawer.** The pin lives in the drawer behind a chip (a car's drawer and the winner's), not on FINN's cards. So it only exists once a chat has judged a car and the reader has opened the reasoning for it. A car gets pinned because of what Lens said about it, not in passing while scrolling.
2. **See the shortlist.** It spans chats and pages: cars pinned from different searches sit side by side.
3. **Judge the shortlist.** Run a judgement over just the pinned cars, with a chat's answers or the reader's saved settings (the reader chooses which, and it's always said). This comparison is what the separate searches couldn't give: the pick of the picks, with the same chips, drawers and trophy the page gets.
4. **Eliminate.** Unpin cars as they're ruled out, and re-judge.
5. **Export and share.** Save the shortlist as a file (PDF) to send on. The winner's full case can be included or left out, the reader's choice. The export says what the cars were judged against and when.

## Constraints to keep

- **One rule for whose answers.** The shortlist judgement names the chat, or the saved settings, it used. The playground ran into trouble here ("one rule for whose answers judge the reader's cars"); don't repeat it.
- **Pinned cars go stale.** Prices, terms and delivery dates change after a car is pinned. The playground refreshed pinned cars from FINN's own responses as they arrived (`lib/refresh-pinned.ts` on `playground`). Bring that back, or re-fetch on judge, and say when a pinned car's data is old or the car has gone.
- **Relative scores.** Boot space, range and CO₂ scores are relative to the set being judged. A car can therefore read differently in the shortlist than on the page it was pinned from. The drawer should say which set it's reading.
- **Nothing on the cards.** No pin buttons on FINN's cards, before or after a judgement.

## Where to start

`playground` has most of the pieces to borrow from: `pinnedCars` storage, the pinned-cars page (`entrypoints/pins/`), `refresh-pinned.ts`, and the PDF export with clickable links (`lib/advice-pdf.ts`, already on this branch). The engine takes any set of cars, so judging a shortlist is `judgeWith(understanding, pinnedCars, …)`.

## Open questions

- Should a shortlist have a cap (say, 8 cars) so the comparison stays readable?
- One shortlist, or one per "project" (e.g. "car for me" vs "car for my parents")?
- Should the export be a PDF only, or also a link? A link would need a server, which Lens doesn't have.
