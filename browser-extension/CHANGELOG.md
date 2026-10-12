# Changelog

## 0.9.1 beta — 12 October 2026

The build for the first outside review. Everything 0.9.0 does, plus:

- **A beta guide** in Settings (its own tab, and a link from the popup): what
  Lens is and why, how it decides, how to read its results, its known limits,
  what might come next, and what a bug report needs to be reproduced — with
  its contents pinned beside it on a wide screen, following the reading.
- **A product demo** in Settings: a reader's journey through Lens, in
  screenshots.
- **The guide and the demo as a web page**, published to GitHub Pages by a
  workflow (`site/`, `.github/workflows/pages.yml`), with the branch's
  documentation as a third tab, read from the repository's own markdown —
  a tab in Settings too.
- **How it was built**, in the guide, the beta note and the README: whose
  work the idea, the research and the decision model are, and how Claude Code
  built the rest.
- **"What you told me" and the Adjust panel** say each question once, with
  every answer under it; the Adjust panel slides in beside a widened chat, and
  the chat can be expanded from its header and resized from its corner.
- **Every car's drawer saves as a PDF**, not only the winner's — all but a car
  that was ruled out. The PDF links each car it names to FINN and keeps its
  blocks whole across pages.
- **The winner is called the winner** wherever another car is compared with
  it, in its gold; each car's drawer tags what it runs on, how much it uses
  and its CO₂.
- **No car fits the dates:** Lens offers the nearest dates a car on the page
  can be rented for, and "a month either way" only where that finds one.
- **Each chat has a short name of its own**, such as "Chat 7KQ-M4X".

Fixed in the final check:

- When every car was over the budget, the winner's headline called it "the
  strongest match for what you told Lens" without saying it was over budget.
- On a filtered listing broader than Lens takes in at once (about 150 cars),
  the chat said it had judged "the cars matching your filters"; it now says
  how many of them it judged.
- Settings' delete confirmations lowercased Lens's name.
- The package no longer ships two unused logos from the project template.
- Answers that changed nothing are gone: "Driveway" (where you park) and
  "Keyless entry & start" (a comfort on 653 of FINN's 698 cars, which could
  only be checked and moved no score beside most comforts). "Booster seat"
  stays — it's the answer for kids past a baby seat — and now says what it
  means. Every answer left changes something, and a test holds them to it.
- Standard equipment Lens says it checks ("Also making sure it has") is now
  said only where it can mark a car down: inside a priority something else is
  scored in. "In traffic" alone no longer claims an automatic gearbox, nor
  "In the city" emergency braking.
- The demo's screenshots are retaken from this build on live finn.com, as
  WebP, named for what they show.
- The previous version's settings layer is gone from the engine: loading,
  saving and migrating stored priorities, profiles and feature picks, which
  nothing in this build called. Settings still clears what that version
  stored.
- Other code nothing used is gone too — a filters-to-answers reader, plain
  sentence summaries, offers and what-ifs, the old follow-up catalogue, and
  pieces meant for an AI model — and unused code is now a type error.

## 0.9.0 beta — 7 October 2026

The first build shared outside development, for FINN's team to try. From here
the beta is frozen: only fixes go in until it's been tried.

What it does:

- **Chats on finn.com.** A bubble in the corner opens Lens. It asks about the
  reader's life a section at a time (who rides along, how and where they
  drive, what the car copes with, what else matters), then the monthly limit,
  dates, distance, fuels and deal-breakers, and says back what it understood
  before judging anything.
- **Judges the cars on the page** — every car matching the reader's filters
  on a listing — against what they said, using only FINN's own data and
  arithmetic on it, plus named, linked European sources where FINN has no
  figure.
- **Chips on FINN's cards** with each car's verdict, and a gold chip on the
  pick; **drawers** behind them with how each car fits, what it costs, and
  why the pick won. The pick's drawer saves as a PDF.
- **The "i"** beside an answer opens a small panel beside the chat, on its
  left, saying what it means and what Lens checks.
- **Many chats**, kept in the browser; **saved answers** new chats start from;
  **Settings** to see and delete everything Lens keeps.

Made for the beta:

- The pick past a limit — nothing within the budget, nothing for the dates —
  is called the closest match everywhere, and the result says which limit.
- Typed words are read the way a tap would set them ("I don't want an
  electric car", "I need an automatic", "30,000 km a year").
- A broken page shows a way out instead of a blank frame.
