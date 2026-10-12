# Finn Lens

A browser extension that helps you choose between FINN car subscriptions by chatting with Lens. You tell it what the car has to do for you, and it judges the cars on finn.com against what you said and explains its pick.

## What the reader sees

1. **Install.** Lens opens finn.com, and a bubble in the corner opens by itself. Lens says hello, explains what's about to happen, and asks its first question.
2. **Questions.** Short ones, each a screen of its own (see [`docs/LIFE-BUBBLES-SPEC-v2.md`](../docs/LIFE-BUBBLES-SPEC-v2.md)):
   - **The reader's life, in four sections of bubbles:** who rides with you (kids, adults, a dog); where and how you drive (city, traffic, long distances, night); what the car has to cope with (weather, what you carry); and what else matters (help driving & parking, comfort, the environment — how green: clean for its fuel type, moderately green, or totally green — and a budget). Some bubbles open a row of chips under themselves where the answer changes what Lens checks — which child seat, where you park, what the weather's like, which comforts, how green, how firm the budget is — and every chip is one the reader picks themselves. Every answer changes something: what's counted, checked or suggested, how much it counts, or a limit (`bubbles.test.ts` holds them to it). Labels are short; the "i" on each is a tooltip saying what it means and what Lens checks. Questions take taps, and a number of the reader's own where one fits (another amount, length, distance, or months from now). Words typed in the chat's message box that mean a bubble land on it, whichever section it's in.
   - **How often**, only for long distances and time in traffic, straight after the driving: it sets how much those count.
   - **The monthly limit, all costs together** (FINN's price, fuel or charging, mileage), **how long**, **from when**, then how far the reader drives — only when a bubble makes it matter; otherwise Lens assumes 1,000 km a month and says so.
   - **What it can run on**: electric, plug-in hybrid, petrol, diesel — the ones on the page, any or all — with stars where how green the reader wants points (totally green: electric; moderately green: the fuels most of whose cars on the page are low CO₂). Not asked when the page has only one fuel. The fuels not picked are set aside before scoring. FINN lists only a plug-in hybrid's official fuel figure, so Lens takes the electricity half of the same official test from the EU's registration data (see below), and says so.
   - **Deal-breakers & deal-sealers**: a row each — low CO₂ emissions, an automatic gearbox, a towbar, six seats and more — set to "Doesn't matter", a deal-breaker ("Must have" / "Must be" / "Mustn't be", which sets cars aside before anything is scored) or a deal-sealer ("Seals it", which counts as a top priority without setting any car aside). Each option says what it means on hover. Each row offers only what Lens can do with it here — one it can only rule on says it can't seal the deal — and the ones the bubbles point to come first, saying why.

   Every question says why it's asked. Anything already said isn't asked again. "Edit this answer" under the last answer takes it back — everything it changed with it — and asks that question again.
3. **Here's what you told me, and what I understood.** A short, read-only card in the chat: each thing the reader said, how much it counts and what Lens will check for it, then the money, the dates and the deal-breakers. Two choices: **"Looks good to me — continue"**, after which Lens asks whether to keep it as their settings or use it for this chat only; or **"This doesn't look right"**, which opens the **Adjust panel** — beside the chat, which the page widens for it, or over it in a narrow window. There each thing is a card: what Lens will check (each can be taken out), standard equipment it checks without rewarding (named only where it can mark a car down: inside a priority something else is scored in), what might matter too (each can be added), and how much it counts — Top priority · Important · Nice to have, the one scale used wherever Lens asks how much something counts, each counting twice the next and each saying what it means, marked as Lens's guess when nothing the reader said set it — with "Change" on each line to answer that question again in the chat. **Done** says back what Lens understood now, with the same two choices.
4. **Judgement.** Lens judges the cars on the page. On a filtered listing, that's the cars matching the filters — up to about 150 at once, and when more match it says how many it judged of how many. The result is short: the pick and its price, why — one line per bubble naming what this car has — and one thing to know. "See why" opens what it got right for each thing the reader said, and the next closest; open it on two results in a row and later ones open that way too, until "Keep it short". "The whole case" opens the winner's drawer.
5. **Chips.** Every car Lens judged gets a chip on its FINN card: its verdict, its place, and whether it's over budget or not for the reader's dates. The pick gets a gold chip with a trophy: "Best for you", or "Closest match" when nothing here fits the budget, the dates or a deal-breaker the reader kept — as the result in the chat and the drawer say it. There are no chips before a judgement.
6. **Drawers.** Clicking a chip opens a drawer beside the page. Every result stays in the chat, and one from earlier — before more cars were added, say — opens on what it said then, marked as an earlier result:
   - **Any car:** how it fits each thing the reader said, what's worth knowing, how it lost to the winner, and what it costs.
   - **The winner:** why it won and what it costs, open; how it fits, what the reader gives up, why not the others, how Lens weighed it and the costs of use, a tap each.
   - **Save as PDF** on every car's drawer but a ruled-out car's, with everything open.
7. **Many chats.** Every chat is kept, and "Your chats" lists them like a messenger. Opening one carries on where it was, and the chips move to its judgement.
8. **Popup.** It says what Lens is and whether it's online on this finn.com tab (it only works on finn.com, and it's unofficial). It also shows how many cars it detected and judged here, the current pick and chats, and a way to Settings and the beta guide.
9. **Settings.** Shows the saved answers (changed by talking to Lens, or forgotten from here), and everything Lens stores, each part clearable: chats, answers, the car cache, and leftovers from earlier versions. Its **Beta guide** tab (`options.html#guide`) explains Lens to someone who has never seen it: what it does and why, how it decides, how to read its results, its known limits, what might come next, and what a bug report needs. Its **Product demo** tab (`options.html#demo`) walks through a reader's journey in screenshots, and its **Documentation** tab (`options.html#docs`) shows this README, the beta note, the changelog and the docs. All three are also published as a web page (see Developing).

## How it's built

| Where | What |
|---|---|
| `lib/reasoning-engine/` | The engine: scoring, cost, emissions, and the narrative it writes about a result. Pure functions over FINN's data. See `docs/FINN-LENS-EMISSIONS-SCORING.md`. |
| `lib/lens-chat/` | What Lens understands from a reader (`understanding.ts`), the life bubbles and what each counts, checks and suggests (`bubbles.ts`), its guided questions (`guide.ts`), a run of the engine for a chat (`run.ts`), and the readings of it: `fit-story.ts` (one car against the reader's needs) and `why-not.ts`. |
| `lib/lens-ai/mock.ts` | The built-in reader for typed messages: keyword rules, no model and no key. A model can stand behind the same `LensAiAdapter` later. |
| `lib/chats/` | A chat as data. `flow.ts` holds the conversation's rules as pure functions. `follow-ups.ts` applies the second questions saved in chats from before the bubbles. `judge.ts` makes the judgement: one engine run gives both the chat's result and every chip's verdict. `store.ts` handles storage, and `data.ts` is the single list of everything stored. |
| `entrypoints/content/` | The content script on finn.com. It keeps the cars FINN's pages load (`data/`, `car-data.ts`) and reads the page (`page/`). `lens/` holds the bubble, the drawer's shell, the chips, and the bridge the frames talk to the page through. |
| `entrypoints/lens-chat/` | The chat: a React page framed into finn.com. |
| `entrypoints/lens-drawer/` | The drawer: a React page framed beside finn.com. It re-runs the chat's judgement and reads one car out of it. |
| `entrypoints/popup/` | The toolbar popup. |
| `entrypoints/options/` | Settings: saved answers and the reader's data; the beta guide (`Guide.tsx`), the product demo (`ProductWalkthrough.tsx`) and the documentation (`Docs.tsx`, the repository's markdown), each with its contents (`OnThisPage.tsx`). |
| `site/` | The beta guide, product demo and documentation as a plain web page, for GitHub Pages: the same components, without the extension. |
| `entrypoints/background.ts` | Relays frame requests to their tab (token-checked), and opens finn.com on install. |

**Storage** (`browser.storage.local`):

- `finnLensChats`: every chat.
- `finnLensActiveChat`: the chat whose judgement the chips show.
- `finnLensSettings`: the answers the reader kept.
- `finnLensOpenBubble`: a one-off request to open the bubble.
- `loadedCarsFromFinnApi`: FINN's cars, as the page loaded them.
- `finnLensChatSize`: the size the reader dragged the chat to.

And in `browser.storage.session`, `lensChatTokens`: each tab's secret, which its Lens frames prove themselves with (cleared when the tab closes). `lib/chats/data.ts` lists every `local` key, with how Settings lets the reader delete it.

## Who built it

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

## Beta

This is the **0.9.1 beta** ([`CHANGELOG.md`](CHANGELOG.md)), for its first outside reviewer; [`docs/BETA.md`](../docs/BETA.md) is the note that goes with the build. The beta is frozen: only fixes go in until it's been tried. `npm run release` checks the types, runs the tests and zips the build into `.output/`.

## Developing

```sh
npm install
npm run dev        # Chrome, with reload
npm run compile    # typecheck
npm test           # vitest
npm run build      # .output/chrome-mv3
npm run site:dev   # the beta guide and product demo as a web page
```

The beta guide and the product demo are also published as a web page: `site/` renders the same components the extension's Settings shows, and `.github/workflows/pages.yml` builds it (`npm run site:build`, into `.output/site`) and deploys it to GitHub Pages on every push to `main` that touches the extension, or by hand from the Actions tab. Pages needs turning on once: Settings → Pages → Source: "GitHub Actions".

To try it by hand, load `.output/chrome-mv3` as an unpacked extension. Installing opens finn.com with the bubble open.

## Next

The shortlist: pinning from the drawers, judging the pinned cars against each other, and exporting them. It's agreed but not built; see [`docs/FUTURE-SHORTLIST.md`](../docs/FUTURE-SHORTLIST.md).

## Left on the `playground` branch

Pinning cars, the pinned-cars page, the earlier Settings screen (priorities and profiles), the Compare/recommendation page, the setup flow, and Lens AI with a Gemini key. The engine and the chat's understanding came from there, and so did the reasoning behind most of it. The playground's `docs/FINN-LENS-HANDOFF.md` is the long version.


How Lens decides — every mechanism, number and source, and the decisions behind them — is written up in [`docs/HOW-FINN-LENS-DECIDES.md`](../docs/HOW-FINN-LENS-DECIDES.md).

## Figures that aren't FINN's

Lens says where every figure it didn't get from FINN comes from, links it, and says what it can't tell you.

- **A plug-in hybrid's electricity.** FINN lists a plug-in hybrid's official CO₂ and fuel figures but not the electricity half of the same test. Every new car registered in the EU is reported with that figure — "Electric energy consumption (EC_AC,weighted)" — to the European Environment Agency under Regulation (EU) 2019/631. `scripts/snapshot-eu-plug-in-electricity.mjs` reads the EEA's 2025 (provisional) data into `lib/reasoning-engine/data/eu-plug-in-electricity.json`, keeping FINN's makers only; `lib/reasoning-engine/eu-electricity.ts` matches a FINN car on make, official CO₂ and fuel figures, and the words that name it (not "xDrive" or "PHEV"). Where versions differ, the highest figure is used and said; where nothing matches, the electricity is named as missing and the car can't be confirmed within a budget — and is set aside under a hard one. Every use says both figures assume the EU test's mix of electric and fuel driving, and that the reader's own depends on how they drive and charge. Re-run the script as FINN adds models or the EEA finalises its data.
- **Other figures and rules from European standards or studies** are in `lib/sources.ts`, each named and linked wherever it's used — in the chat's "i" tooltips (which stay open long enough to click a link), under the drawer's story lines and cost lines, and at the foot of its environment panel: the German CO₂ label rules (Pkw-EnVKV) for the A–G classes; the ICCT's figures for new cars' CO₂ and electric cars' consumption, behind Lens's comparison points; and the European Commission's real-world CO₂ report, said with its date — plug-ins registered in 2021 emitted 3.5 times their official figure, before the EU changed the method from 2025, which FINN's figures follow. Each link was checked against the document when it was added.
