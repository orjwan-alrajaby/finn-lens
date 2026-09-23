# Live conversations with Lens

`npm test` holds Lens to what it promises around a model reply. These are the
other half: real messages through the real model, read by a person.

```bash
npm run eval:chat                     # all ten round-two situations
ONLY=4,10 npm run eval:chat           # just those
REPLAY=evals/recorded npm run eval:chat   # recorded model replies through today's code
```

Each run writes `evals/out/<scenario>.txt` — what the reader would see, what
Lens understood, what the engine was given, and why the pick fits — and the raw
model replies beside it as `.json`. Copy a run's `.json` files into a folder
and point `REPLAY` at it to see what a change to the deterministic code does to
those same replies without spending any quota.

The harness (`harness.ts`) runs the steps `LensChat.talk` runs, over a fixed
48-car page from FINN's committed fleet snapshot. The rental-period ask is
answered "no fixed dates", and the budget ask "no limit" when the person gave
none.

**Keys.** `keys.ts` reads every `GEMINI_API_KEY` line in
`lens-ai-server/.env`, commented out or not (a trailing `# note` names it in
the log). It stays on one key until every model on it reports its daily
free-tier quota spent, then switches to the next. `GEMINI_API_KEY` in the
environment overrides the file. Replies are cached in `evals/.cache` by prompt
and request; `LENS_EVAL_FRESH=1` asks again.
