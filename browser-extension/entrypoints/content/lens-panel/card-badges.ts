import {
  buildFitAnalysis,
  FIT_BANDS,
  FIT_METER_SEGMENTS,
  FIT_SEGMENTS,
  type FitLevel,
} from "@/lib/reasoning-engine/fit";
import { currentJudging, judgingLabel, setAsideByChat, type Judging } from "@/lib/lens-chat/judging";
import {
  FIT_BADGE_BASE,
  FIT_BADGE_HOOK,
  FIT_BADGE_NEUTRAL_CLASS,
  FIT_BADGE_NEUTRAL_LABEL,
} from "@/lib/card-controls";
import type { PinnedFinnCar } from "@/lib/types";

import { brandMark, el } from "./dom";
import { openPanel } from "./panel";
import {
  cardConfigId,
  cardName,
  cardPhoto,
  CARD_SELECTORS,
} from "./currentCar";
import {
  getLoadedCars,
  getPinnedCars,
} from "../injectors/inject-pin-button/injectPinCarButtonIntoNode/storage";

/**
 * Lens's answer on the card, before the reader opens anything.
 *
 * The panel answers "how does this car fit me" one car at a time, which is the
 * right shape for a car the reader is already looking at and the wrong shape
 * for a page of forty. Browsing is a scanning activity: the reader is deciding
 * which cars are worth opening, and an answer they have to open a car to get
 * arrives after the decision it was meant to inform.
 *
 * So every card FINN draws gets a Lens control, and clicking it opens the
 * panel on that car. Where a verdict can be worked out, the control carries
 * it, in the same words and the same four-segment meter the panel uses.
 *
 * **The control and the verdict arrive separately, and that is the point.**
 * This used to be one pass that did both, which meant a card got nothing at
 * all until the car's data had reached storage — and that data does not
 * arrive with the card. finn.com draws the cards; the interceptor's copy of
 * FINN's own response lands afterwards. So the control appeared on some page
 * loads and not others, for a reason the reader could neither see nor act on,
 * while the pin button beside it appeared every time. The pin button needs
 * nothing but the card it goes on. Now neither does this.
 *
 * The button therefore goes on in the same synchronous pass as the pin
 * button, saying what it can honestly say at that moment — that Lens can
 * answer this question — and the verdict replaces that as soon as there is
 * one. Clicking works throughout: the panel names the car and waits.
 *
 * Two rules survive from when this was one pass, and one does not:
 *
 * - **Nothing invented.** A car whose equipment FINN didn't list has no fit
 *   to report, so the control keeps its neutral label rather than claiming a
 *   band it can't support.
 *
 * - ~~Nothing without data.~~ Gone. It was a rule about what to *draw*, and
 *   its effect was to hide the way in to the one screen that could have
 *   filled the gap it was reacting to.
 *
 * - ~~No verdict without settings.~~ Also gone, and for a related reason.
 *   Lens ships defaults now — a priority order, and the five features most
 *   drivers say they care about in each — so it has a real opinion to give
 *   before the reader has said anything. The rule behind the rule survives
 *   intact: a verdict built from Lens's assumptions must never be passed off
 *   as the reader's own. There is no room on a pill to say that, so the
 *   panel one click away says it, at the top, before the reading. See
 *   `defaultsNotice`.
 */

/* Shared with the setup flow's React copy of this pill — see
   `lib/card-controls.ts` for why the strings live outside both drawings. */
const BADGE = FIT_BADGE_HOOK;

/** Marks a card as carrying a control, whether or not it has a verdict yet. */
const MARKER = "data-finn-lens-fit";

/** Carries the id of the car whose verdict is currently displayed. */
const VERDICT = "data-finn-lens-verdict";

/** Marks a block this file made into a positioning context, so it can undo it. */
const POSITIONED = "data-finn-lens-anchored";

/* -------------------------------------------------------------------------- */
/* The badge                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The four segments, and what they look like before there is a band.
 *
 * `null` is the control's opening state rather than a fifth band: it holds
 * the pill's shape and says nothing, so a verdict arriving later replaces a
 * placeholder rather than resizing the card's furniture under the reader.
 */
function meter(level: FitLevel | null): HTMLElement {
  const band = level ? FIT_BANDS[level] : null;
  const filled = level ? FIT_SEGMENTS[level] : 0;

  const segmentClass = (index: number): string => {
    if (!band) return "bg-finn-accent-blue/25";

    return index < filled ? band.barClass : band.emptyBarClass;
  };

  return el(
    "span",
    {
      class: "finn-lens-fit-meter flex items-center gap-[2px]",
      attrs: { "aria-hidden": "true" },
    },
    Array.from({ length: FIT_METER_SEGMENTS }, (_, index) =>
      el("span", {
        class: ["block h-2.5 w-[3px] rounded-full", segmentClass(index)].join(
          " ",
        ),
      }),
    ),
  );
}

/** How the pill looks and reads before there is a verdict on it. */
const NEUTRAL_CLASS = FIT_BADGE_NEUTRAL_CLASS;
const NEUTRAL_LABEL = FIT_BADGE_NEUTRAL_LABEL;

/**
 * A pill over the photograph, in the corner nothing else uses.
 *
 * It began as a strip under the card, which was safe and read as a row of
 * furniture bolted on below FINN's own — a second card stacked under the
 * first. On the photograph it reads as part of the card, the way a discount
 * flash or an availability tag would, and it costs the card no height at all.
 *
 * Bottom-left because the top-right is the pin and the top-left is FINN's own
 * compare control. The photo blocks are already positioned, so this lays over
 * one without changing anything about the layout underneath it.
 */
function badgeFor(id: number, name: string | undefined): HTMLElement {
  return el(
    "button",
    {
      class: [BADGE, FIT_BADGE_BASE, NEUTRAL_CLASS].join(" "),
      attrs: {
        type: "button",
        "aria-label": name
          ? `Finn Lens: see how ${name} fits you.`
          : "Finn Lens: see how this car fits you.",
      },
      on: {
        /*
         * FINN's card is a link, and every part of it is clickable. Without
         * this, asking Lens about a car would navigate away from the page the
         * reader was scanning — which is the opposite of what a badge on a
         * list is for.
         */
        click: (event) => {
          event.preventDefault();
          event.stopPropagation();

          void openPanel({ carId: id, carName: name });
        },
      },
    },
    [
      /*
       * Whose verdict this is, before what the verdict says.
       *
       * The pill sits on FINN's photograph inside FINN's card, and everything
       * around it is FINN's. Without a mark it reads as one more thing the
       * site is telling you about the car — which is exactly wrong, because
       * the claim it makes is ranked against what *this reader* said matters
       * and FINN has no part in it. The mark is the cheapest way to say that,
       * and it goes first because "whose is this" is the question that has to
       * be answered before the label means anything.
       *
       * A 16px disc against an 11px label. Small enough that the pill still
       * reads as a verdict with a source on it rather than a logo with a
       * verdict attached, and big enough that the artwork inside it — an
       * aperture, at 13px — is still a shape rather than a smudge.
       *
       * Idling, like the mark everywhere else Lens draws it — including the
       * tour's React copy of this pill — so the reader who watched it turn
       * during setup meets the same wheel here.
       */
      brandMark(16, "", { idle: true }),

      meter(null),

      el("span", {
        class: "finn-lens-fit-label min-w-0 truncate text-[11px] font-black",
        text: NEUTRAL_LABEL,
      }),

      /*
       * The verdict is a claim; this is the offer to see the working, and it
       * has to look like one. A bare chevron says "there is more" without
       * saying it can be asked for, and on a photograph — where every pixel
       * belongs to a card that is itself a link — "more" reads as "this opens
       * the car", which is the one thing this control does not do. The word
       * restores the promise the panel then keeps: you are about to be told
       * why.
       */
      el("span", {
        class: [
          "flex shrink-0 items-center gap-0.5 border-l pl-1.5",
          "border-current/25 text-[11px] font-bold opacity-70",
        ].join(" "),
        attrs: { "aria-hidden": "true" },
        text: "Why ›",
      }),
    ],
  );
}

/**
 * Puts a verdict on a control that was drawn without one.
 *
 * Edited in place rather than rebuilt, so a verdict landing underneath the
 * reader doesn't take the focus, the hover or a click already in progress
 * with it.
 */
function applyVerdict(
  badge: HTMLElement,
  level: FitLevel,
  label: string,
  name: string | undefined,
  /** Whose answers the verdict is by, in words: "your chat with Lens: An SUV". */
  by: { chat: boolean; long: string },
): void {
  badge.classList.remove(...NEUTRAL_CLASS.split(" "));
  badge.classList.add(...FIT_BANDS[level].chipClass.split(" "));

  badge.querySelector(".finn-lens-fit-meter")?.replaceWith(meter(level));

  const text = badge.querySelector(".finn-lens-fit-label");

  /*
   * Said on the badge itself when the chat is judging: a card on the same
   * page as a conversation could otherwise be read as the chat's verdict when
   * it was the settings', or the other way round.
   */
  if (text) text.textContent = by.chat ? `${label} · chat` : label;

  badge.title = `${by.long}.`;
  badge.setAttribute(
    "aria-label",
    name
      ? `Finn Lens: ${label} for ${name}. ${by.long}. See how it fits you.`
      : `Finn Lens: ${label}. ${by.long}. See how this car fits you.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Putting them on, and taking them off                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which page's verdicts are the current ones.
 *
 * Reading the settings and the car cache takes four storage round-trips, and
 * finn.com moves between cars without reloading — so a verdict pass can
 * easily be mid-await when the reader navigates and the page is cleared.
 * Without this the pass would resume afterwards and paint the previous
 * page's verdicts onto the new one's cards.
 */
let generation = 0;

/**
 * The control, on every card, now.
 *
 * Synchronous and free: it reads nothing and asks storage nothing, so it runs
 * in the same mutation pass as the pin button and finishes in the same tick.
 * That is the entire reason it is a separate function from the verdict.
 */
export function injectFitButtons(): void {
  for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTORS)) {
    if (card.hasAttribute(MARKER)) continue;

    const id = cardConfigId(card);

    /* No id is no car, and nothing to ask about. */
    if (id == null) continue;

    card.setAttribute(MARKER, String(id));

    const photo = cardPhoto(card);

    anchor(photo);

    photo.append(badgeFor(id, cardName(card)));
  }
}

/** Read once per pass rather than once per card. */
async function context(): Promise<{
  judging: Judging;
  carFor: (id: number) => PinnedFinnCar | null;
} | null> {
  /*
   * Whose answers, from the one place every surface reads it: the chat's
   * while it has a result, the saved settings otherwise (`judging.ts`).
   */
  const [judging, pinned, loaded] = await Promise.all([
    currentJudging(),
    getPinnedCars(),
    getLoadedCars(),
  ]);

  return {
    judging,
    carFor: (id) => {
      const car = pinned[id] ?? loaded[id];

      /*
       * `url` and `pinnedAt` are unread by every scoring and narrative
       * function; a card's verdict needs the same car whether or not the
       * reader has pinned it.
       */
      return car ? ({ url: "", pinnedAt: "", ...car } as PinnedFinnCar) : null;
    },
  };
}

/**
 * Fills in the verdicts that can be worked out, and leaves the rest alone.
 *
 * Run again whenever the cars or the settings change, so a control drawn
 * before its data existed picks up its band the moment the data lands. A
 * control that never gets one keeps its neutral label and stays clickable,
 * which is an honest state rather than a broken one.
 */
export async function applyFitVerdicts(): Promise<void> {
  const pending = [
    ...document.querySelectorAll<HTMLElement>(`[${MARKER}]`),
  ].filter((card) => !card.hasAttribute(VERDICT));

  if (!pending.length) return;

  const era = generation;
  const shared = await context();

  if (!shared || era !== generation) return;

  for (const card of pending) {
    /* Re-checked: a concurrent pass may have got here during the await. */
    if (card.hasAttribute(VERDICT)) continue;

    const id = cardConfigId(card);
    const car = id == null ? null : shared.carFor(id);

    /*
     * Left unrecorded on purpose. A card whose car has not reached the cache
     * yet is not a card without a verdict — it is a card whose verdict has
     * not arrived, and the next pass has to be free to try again.
     */
    if (!car) continue;

    const { answers } = shared.judging;
    const by = { chat: shared.judging.by === "chat", long: judgingLabel(shared.judging).long };
    const badge = card.querySelector<HTMLElement>(`.${BADGE}`);

    if (!badge) continue;

    /*
     * A car the chat's own rules set aside — "not an SUV", "electric only" —
     * isn't graded as if the rule weren't there. The chat never ranked it,
     * and a "good match" on it would contradict the conversation.
     */
    if (setAsideByChat(shared.judging, car)) {
      card.setAttribute(VERDICT, String(car.id));
      applyVerdict(badge, "limited", "Ruled out", cardName(card), by);
      continue;
    }

    const analysis = buildFitAnalysis(car, answers.priorities, answers.preferences, answers.features);

    /* Nothing to report is reported as nothing: the neutral label stays. */
    if (analysis.overall.level === "unknown") continue;

    card.setAttribute(VERDICT, String(car.id));

    applyVerdict(
      badge,
      analysis.overall.level,
      analysis.overall.label,
      cardName(card),
      by,
    );
  }
}

/**
 * The whole pass: draw what's missing, then say what can be said.
 *
 * The two halves are deliberately not one await — the buttons are on the page
 * before the first storage read is even issued.
 */
export async function injectFitBadges(): Promise<void> {
  injectFitButtons();

  await applyFitVerdicts();
}

/**
 * Takes every control off, and gives the markup back as FINN wrote it.
 */
export function removeFitBadges(): void {
  generation += 1;

  for (const badge of document.querySelectorAll(`.${BADGE}`)) badge.remove();

  for (const card of document.querySelectorAll(`[${MARKER}]`)) {
    card.removeAttribute(MARKER);
    card.removeAttribute(VERDICT);
  }

  for (const block of document.querySelectorAll(`[${POSITIONED}]`)) {
    unanchor(block);
  }
}

/**
 * Every verdict worked out again, the controls left where they are.
 *
 * For a settings change, which makes every band on the page a claim about
 * what the reader used to care about. The buttons themselves are unaffected —
 * they say nothing that could have gone stale — so they are reset to neutral
 * rather than removed, and the page never blinks.
 */
export async function refreshFitBadges(): Promise<void> {
  generation += 1;

  for (const card of document.querySelectorAll<HTMLElement>(`[${VERDICT}]`)) {
    card.removeAttribute(VERDICT);

    const id = cardConfigId(card);
    const badge = card.querySelector<HTMLElement>(`.${BADGE}`);

    if (badge && id != null) {
      badge.replaceWith(badgeFor(id, cardName(card)));
    }
  }

  await applyFitVerdicts();
}

/* -------------------------------------------------------------------------- */
/* Hanging the pill on somebody else's markup                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether a block can already hold an absolutely positioned child.
 *
 * Computed style is the real answer and is used wherever it exists. The class
 * check behind it is for the test environment, which has no layout engine —
 * and it is a fair reading of this particular page, since finn.com is built
 * in Tailwind and says so in its class lists.
 */
function isPositioned(element: HTMLElement): boolean {
  try {
    const computed = element.ownerDocument?.defaultView?.getComputedStyle?.(
      element,
    );

    if (computed?.position) return computed.position !== "static";
  } catch {
    /* No layout engine. Fall through to the class list. */
  }

  return ["relative", "absolute", "fixed", "sticky"].some((name) =>
    element.classList.contains(name),
  );
}

/**
 * Make a block able to hold the pill, and remember if we changed it.
 *
 * FINN's own photo wrappers are already positioned, so this is usually a
 * no-op. It matters on the fallback path — the card itself, when the media
 * block can't be identified — where a static parent lets an absolutely
 * positioned pill escape to whatever ancestor is positioned. That is a badge
 * that looks like it failed to load: on the page, but in the wrong card or
 * clipped out of sight. The pin button has always guarded its own anchor this
 * way; the badge never did.
 */
function anchor(element: HTMLElement): void {
  if (isPositioned(element)) return;

  element.classList.add("relative");
  element.setAttribute(POSITIONED, "");
}

/** Puts a block back exactly as FINN wrote it. */
function unanchor(element: Element): void {
  element.classList.remove("relative");
  element.removeAttribute(POSITIONED);

  /* An emptied class attribute is still a change to somebody else's markup. */
  if (element.getAttribute("class") === "") element.removeAttribute("class");
}
