# Finn Lens

A browser extension that helps you choose between FINN car subscriptions by chatting with Lens. You tell it what the car has to do for you, and it judges the cars on finn.com against what you said and explains its pick.

## What the reader sees

1. **Install.** Lens opens finn.com, and a bubble in the corner opens by itself. Lens says hello, explains what's about to happen, and asks its first question.
2. **Questions.** Short ones, each a screen of its own (see [`docs/LIFE-BUBBLES-SPEC-v2.md`](../docs/LIFE-BUBBLES-SPEC-v2.md)):
   - **The reader's life, in four sections of bubbles:** who rides with you (kids, adults, a dog); where and how you drive (city, traffic, long distances, night); what the car has to cope with (weather, what you carry); and what else matters (help driving & parking, comfort, the environment, a budget). Some bubbles open a row of chips under themselves where the answer changes what Lens checks — where you park, what the weather's like, which comforts, how firm the budget is — with "Select all" where several can be true at once. Labels are short; the "i" on each is a tooltip saying what it means and what Lens checks. "Something else…" takes the reader's own words, and words that mean a bubble land on it, whichever section it's in.
   - **How often**, only for long distances and time in traffic, straight after the driving: it sets how much those count.
   - **The monthly limit, all costs together** (FINN's price, fuel or charging, mileage), **how long**, **from when**, then how far the reader drives — only when a bubble makes it matter; otherwise Lens assumes 1,000 km a month and says so.
   - **Deal-breakers & deal-sealers**: a row each — electric, low CO₂, an automatic gearbox, a towbar, six seats and more — set to "Doesn't matter", a deal-breaker ("Must have" / "Mustn't be", which sets cars aside before anything is scored) or a deal-sealer ("Seals it", which counts as much as anything can without setting any car aside). Each row offers only what Lens can do with it here, and the ones the bubbles point to come first, saying why.

   Every question says why it's asked. Anything already said isn't asked again. "Edit this answer" under the last answer takes it back — everything it changed with it — and asks that question again.
3. **Here's what I understood.** One block per bubble: what Lens will check (each can be taken out), standard equipment it checks without rewarding, what the cars here differ on that might matter too (each can be added), what FINN's data can't tell it, and how much the bubble counts — Must have · Matters · Nice to have, marked as Lens's guess when nothing the reader said set it. Then the limits and deal-breakers, each with "Change". No priority names or percentages here. Nothing moves on until the reader taps "Looks good to me — let's go"; then Lens asks whether to keep it as their settings or use it for this chat only.
4. **Judgement.** Lens judges the cars on the page. On a filtered listing, that's every car matching the filters. The result is short: the pick and its price, why — one line per bubble naming what this car has — and one thing to know. "See why" opens what decided it, what you'd give up, which bubbles put weight where, and the next closest; open it on two results in a row and later ones open that way too, until "Keep it short".
5. **Chips.** Every car Lens judged gets a chip on its FINN card: its verdict, its place, and whether it's over budget. The pick gets a gold "Best for you" chip with a trophy. There are no chips before a judgement.
6. **Drawers.** Clicking a chip opens a drawer beside the page. Every result stays in the chat, and one from earlier — before more cars were added, say — opens on what it said then, marked as an earlier result:
   - **Any car:** how it fits each thing the reader said, what's worth knowing, how it lost to the pick, and what it costs.
   - **The pick:** why it won and what it costs, open; how it fits, what the reader gives up, why not the others, how Lens weighed it and the costs of use, a tap each; plus **Save as PDF**, which has everything open.
7. **Many chats.** Every chat is kept, and "Your chats" lists them like a messenger. Opening one carries on where it was, and the chips move to its judgement.
8. **Popup.** It says what Lens is and whether it's online on this finn.com tab (it only works on finn.com, and it's unofficial). It also shows how many cars it detected and judged here, the current pick and chats, and a way to Settings.
9. **Settings.** Shows the saved answers (changed by talking to Lens, or forgotten from here), and everything Lens stores, each part clearable: chats, answers, the car cache, and leftovers from earlier versions.

## How it's built

| Where | What |
|---|---|
| `lib/reasoning-engine/` | The engine: scoring, cost, emissions, and the narrative it writes about a result. Pure functions over FINN's data. See `docs/FINN-LENS-EMISSIONS-SCORING.md`. |
| `lib/lens-chat/` | What Lens understands from a reader (`understanding.ts`), the life bubbles and what each counts, checks and suggests (`bubbles.ts`), its guided questions (`guide.ts`), a run of the engine for a chat (`run.ts`), and the readings of it: `fit-story.ts` (one car against the reader's needs) and `why-not.ts`. |
| `lib/lens-ai/mock.ts` | The built-in reader for typed messages: keyword rules, no model and no key. A model can stand behind the same `LensAiAdapter` later. |
| `lib/chats/` | A chat as data. `flow.ts` holds the conversation's rules as pure functions. `follow-ups.ts` holds the second questions of chats from before the bubbles. `judge.ts` makes the judgement: one engine run gives both the chat's result and every chip's verdict. `store.ts` handles storage, and `data.ts` is the single list of everything stored. |
| `entrypoints/content/` | The content script on finn.com. It keeps the cars FINN's pages load (`data/`, `car-data.ts`) and reads the page (`page/`). `lens/` holds the bubble, the drawer's shell, the chips, and the bridge the frames talk to the page through. |
| `entrypoints/lens-chat/` | The chat: a React page framed into finn.com. |
| `entrypoints/lens-drawer/` | The drawer: a React page framed beside finn.com. It re-runs the chat's judgement and reads one car out of it. |
| `entrypoints/popup/` | The toolbar popup. |
| `entrypoints/options/` | Settings: saved answers and the reader's data. |
| `entrypoints/background.ts` | Relays frame requests to their tab (token-checked), and opens finn.com on install. |

**Storage** (`browser.storage.local`):

- `finnLensChats`: every chat.
- `finnLensActiveChat`: the chat whose judgement the chips show.
- `finnLensSettings`: the answers the reader kept.
- `finnLensOpenBubble`: a one-off request to open the bubble.
- `loadedCarsFromFinnApi`: FINN's cars, as the page loaded them.

## Developing

```sh
npm install
npm run dev        # Chrome, with reload
npm run compile    # typecheck
npm test           # vitest
npm run build      # .output/chrome-mv3
```

To try it by hand, load `.output/chrome-mv3` as an unpacked extension. Installing opens finn.com with the bubble open.

## Next

The shortlist: pinning from the drawers, judging the pinned cars against each other, and exporting them. It's agreed but not built; see [`docs/FUTURE-SHORTLIST.md`](../docs/FUTURE-SHORTLIST.md).

## Left on the `playground` branch

Pinning cars, the pinned-cars page, Settings, the Compare/recommendation page, the setup flow, and Lens AI with a Gemini key. The engine and the chat's understanding came from there, and so did the reasoning behind most of it. The playground's `docs/FINN-LENS-HANDOFF.md` is the long version.
