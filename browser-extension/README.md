# Finn Lens

A browser extension that helps you choose between FINN car subscriptions by chatting with Lens. You tell it what the car has to do for you, and it judges the cars on finn.com against what you said and explains its pick.

## What the reader sees

1. **Install.** Lens opens finn.com, and a bubble in the corner opens by itself. Lens says hello, explains what's about to happen, and asks its first question.
2. **Questions.** Lens asks what the car has to do a few needs at a time: how many people ride with you, then who they are (the count decides seats and doors; with nobody along, it only asks about pets), the driving you do, where you park, the weather, what you carry, what makes it yours, and how much CO₂ and fuel or electricity use matter, each as its own short question. Each need says what it means, and which equipment Lens will check, as it's picked. After that:
   - a follow-up where one answer changes what Lens looks for (child seats or older kids? snow, or rain and fog?);
   - what matters most, when there are more than three: the needs grouped where they go together (children, adults and pets; winters and summers), each named for what the car should do, and about a third of the groups picked, two to five — what the answers said could decide it starts picked, and a picked group counts twice as much as the rest;
   - the monthly limit, then anything that rules a car out (the limit itself can be one);
   - how long the car is needed, and how far the reader drives;
   - equipment "worth a look" that the cars on the page differ on.

   Every question says why it's asked, and takes the reader's own answer, in words or as a number. Anything already said isn't asked again. "Edit this answer" under the last answer takes it back — everything it changed with it — and asks that question again, one answer at a time, until the answers are kept.
3. **Calibration.** Lens says back what it will judge by: the reader's needs, each set to must have, important or nice to have with a tap, plus the limits, each with "Change". The engine's weights sit folded away underneath. Nothing moves on until the reader taps "Looks good to me — let's go"; then Lens asks whether to keep it as their settings, so new chats start from it, or use it for this chat only.
4. **Judgement.** Lens judges the cars on the page. On a filtered listing, that's every car matching the filters. The chat names its pick and the next closest cars.
5. **Chips.** Every car Lens judged gets a chip on its FINN card: its verdict, its place, and whether it's over budget. The pick gets a gold "Best for you" chip with a trophy. There are no chips before a judgement.
6. **Drawers.** Clicking a chip opens a drawer beside the page:
   - **Any car:** how it fits each thing the reader said, what's worth knowing, how it lost to the pick, and what it costs.
   - **The pick:** the whole case for it (why it won, priority by priority, what the reader gives up, why not the others), plus **Save as PDF**.
7. **Many chats.** Every chat is kept, and "Your chats" lists them like a messenger. Opening one carries on where it was, and the chips move to its judgement.
8. **Popup.** It says what Lens is and whether it's online on this finn.com tab (it only works on finn.com, and it's unofficial). It also shows how many cars it detected and judged here, the current pick and chats, and a way to Settings.
9. **Settings.** Shows the saved answers (changed by talking to Lens, or forgotten from here), and everything Lens stores, each part clearable: chats, answers, the car cache, and leftovers from earlier versions.

## How it's built

| Where | What |
|---|---|
| `lib/reasoning-engine/` | The engine: scoring, cost, emissions, and the narrative it writes about a result. Pure functions over FINN's data. See `docs/FINN-LENS-EMISSIONS-SCORING.md`. |
| `lib/lens-chat/` | What Lens understands from a reader (`understanding.ts`), its guided questions (`guide.ts`), a run of the engine for a chat (`run.ts`), and the readings of it: `fit-story.ts` (one car against the reader's needs) and `why-not.ts`. |
| `lib/lens-ai/mock.ts` | The built-in reader for typed messages: keyword rules, no model and no key. A model can stand behind the same `LensAiAdapter` later. |
| `lib/chats/` | A chat as data. `flow.ts` holds the conversation's rules as pure functions. `follow-ups.ts` has the second questions per need and what's "worth a look". `judge.ts` makes the judgement: one engine run gives both the chat's result and every chip's verdict. `store.ts` handles storage, and `data.ts` is the single list of everything stored. |
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
