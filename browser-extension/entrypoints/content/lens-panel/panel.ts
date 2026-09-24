import { buildFitAnalysis } from "@/lib/reasoning-engine/fit";
import { hasSavedLensSettings } from "@/lib/reasoning-engine";
import { currentJudging, judgeBy, judgingLabel, setAsideByChat, type Judging } from "@/lib/lens-chat/judging";

import {
  brandMark,
  el,
  empty,
  fragment,
  icon,
  panelStyles,
  spinner,
} from "./dom";
import { hasRoomBeside, PANEL_WIDTH } from "./panel-width";
import { clearHighlight, highlightConfiguration } from "./highlight";
import { analysisBody, closeInfoTip, defaultsNotice } from "./sections";
import { pinControl } from "./pin-control";
import { resolveCar } from "./currentCar";

/**
 * The panel itself: a drawer over finn.com, and the states it can be in.
 *
 * It lives in a shadow root so that nothing it draws can reach FINN's page and
 * nothing on FINN's page can restyle it. Everything it needs is read when it
 * opens — settings, the car, the analysis — so a reader who never opens it
 * pays for none of it, and a reader who opens it twice gets whatever their
 * settings say the second time.
 */

const HOST_ID = "finn-lens-analysis-root";

/**
 * How long the panel waits for a car that is already on its way.
 *
 * Much shorter than it was, because giving up is no longer the next step —
 * asking FINN is. This only has to cover the gap between a card being drawn
 * and the interceptor's copy of the request that drew it reaching storage,
 * which is a few hundred milliseconds. Past that the car probably is not
 * coming on its own, and waiting longer only delays the request that will
 * actually answer.
 */
const CAR_WAIT_MS = 1500;

/** The stored settings that change what an analysis says. */
const WATCHED_KEYS = [
  "finnLensPreferences",
  "finnLensPriorities",
  "finnLensCategoryFeatures",
];

interface Panel {
  /** Point an already-open panel at a different car. */
  show: (request: PanelRequest) => void;
  /** Slides it out, then takes it off the page. */
  destroy: () => void;
  /** Takes it off the page now, mid-slide or not. */
  remove: () => void;
}

let open: Panel | null = null;

/** A panel still sliding out, so opening another can clear it at once. */
let closing: Panel | null = null;

/**
 * The longest the slide-out can take before the host goes regardless: the
 * DRAWER block's 200ms, with room for a busy page. `animationend` is what
 * normally ends it, but a tab in the background may never fire one.
 */
const SLIDE_OUT_MAX_MS = 400;

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

function message(
  title: string,
  body: string,
  action?: { label: string; onClick: () => void },
): DocumentFragment {
  return fragment([
    el("div", { class: "px-5 py-6" }, [
      el("p", {
        class: "text-base font-black leading-6 text-finn-black",
        text: title,
      }),
      el("p", {
        class: "mt-2 text-[13px] leading-5 text-finn-iron",
        text: body,
      }),

      action
        ? el("button", {
            class: [
              "mt-4 flex h-11 w-full items-center justify-center rounded-full",
              "bg-finn-accent-blue text-[13px] font-black text-white",
              "transition-colors hover:bg-finn-highlight-navy",
            ].join(" "),
            attrs: { type: "button" },
            text: action.label,
            on: { click: action.onClick },
          })
        : null,
    ]),
  ]);
}

/**
 * What the panel says while it is still finding out.
 *
 * Named after the car whenever the thing that opened the panel knows the
 * name — which a card badge always does, because it is sitting on the card
 * that says it. That matters more than it sounds: the button is now drawn
 * before the car's data has arrived, so this state is the ordinary way a
 * reader meets the panel from a listing rather than a rare one. "Reading
 * this car…" on a page of forty leaves them wondering which; naming it
 * confirms they clicked the one they meant before the answer arrives.
 */
function loadingState(carName?: string): DocumentFragment {
  return fragment([
    el(
      "div",
      {
        class: [
          "flex h-full min-h-80 flex-col items-center justify-center",
          "gap-5 px-8 text-center",
        ].join(" "),
      },
      [
        /*
         * Full weight, not a tint. It was drawn at 70% black, which on the
         * panel's white made it look like a disabled control rather than a
         * working one — the wheel is the mark, and a faded mark reads as
         * something switched off.
         */
        spinner("h-16 w-16 text-finn-black"),

        el("div", {}, [
          el("p", {
            class: "text-[15px] font-black leading-6 text-finn-black",
            text: carName ? `Reading ${carName}…` : "Reading this car…",
          }),

          /*
           * What the wait is actually for. The panel is doing two things a
           * reader cannot see — finding what FINN published about this car,
           * then measuring it against their own priorities — and naming them
           * is the difference between a pause and a stall.
           */
          el("p", {
            class: "mt-1.5 text-[12px] leading-5 text-finn-iron",
            text: "Finding what FINN published about it, then measuring that against your priorities.",
          }),
        ]),
      ],
    ),
  ]);
}

const openSettings = () => {
  void browser.runtime.sendMessage({ type: "OPEN_SETTINGS_PAGE" });
};

/*
 * A reader who has configured nothing is sent to the setup flow rather than
 * to Settings. Settings is a page of controls for someone who knows what
 * they control; this reader has just met the product on a car listing and
 * needs the explanation that comes with the questions.
 */
const openSetup = () => {
  void browser.runtime.sendMessage({ type: "OPEN_ONBOARDING_PAGE" });
};

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Works out what to show, in the order the answers become knowable.
 *
 * Settings first: without them there is no question to ask, and offering to
 * analyse a car against defaults the reader has never seen would be putting
 * words in their mouth. Then the car, which can fail in two different ways
 * that deserve two different sentences — we can't tell which car this is, and
 * we know which car this is but couldn't load it.
 */
/**
 * The car the panel was opened about. Always one, now.
 *
 * `carId` used to be optional, meaning "whatever this page is showing" — which
 * is how the floating launcher asked, because it belonged to the page rather
 * than to any car on it. That is what the configuration chooser existed to
 * resolve: the launcher could only say "this model", so the panel had to ask
 * which of the model's configurations the reader meant.
 *
 * The badge asks the other way round. It sits on a card, so it names the car,
 * and it is now the only way in — every configuration on a detail page carries
 * its own. The question the chooser asked is answered before the panel opens,
 * so the chooser and everything reachable only through it is gone.
 */
interface PanelRequest {
  carId: number;
  /**
   * The car's name as the card that was clicked spells it, so the loading
   * state can name what it is loading. Only ever used for that: the analysis
   * itself takes every word from the car FINN sent, never from the page.
   */
  carName?: string;
}

async function render(
  into: HTMLElement,
  dock: HTMLElement,
  retry: () => void,
  request: PanelRequest,
  /**
   * False once a newer render has started or the panel has closed. Every
   * await below can outlast a click on the next card — waiting for a car is
   * up to `CAR_WAIT_MS` and then a request to FINN — and a render that
   * resumed regardless would paint the previous car over the one the reader
   * just asked about, or mark a card on a page whose panel has gone.
   */
  isCurrent: () => boolean,
): Promise<void> {
  closeInfoTip();
  empty(into);
  /*
   * Emptied on every render, and filled again only once there is a car to pin.
   * Every path out of this function that isn't a loaded car — still loading,
   * settings unreadable, car unreachable — leaves it empty, so the dock never
   * offers to pin something the panel could not read.
   */
  empty(dock);
  into.append(loadingState(request.carName));

  /*
   * Whether the reader has answered for themselves — which no longer decides
   * whether they get an answer, only what it is captioned with.
   *
   * The panel used to stop here and offer the setup flow, on the grounds that
   * a verdict measured against defaults the reader has never seen is not
   * their verdict. That was right about the verdict and wrong about the
   * refusal: it meant the first thing anyone met on a car listing was a form,
   * and the product's best argument for filling the form in — an actual
   * worked answer about the car in front of them — was the thing being
   * withheld until they had. Lens ships defaults now, so it can answer, and
   * `defaultsNotice` says whose assumptions the answer came from.
   */
  let configured: boolean;

  try {
    configured = await hasSavedLensSettings();
  } catch (error) {
    console.error("[FinnLens] couldn't read your settings", error);

    if (!isCurrent()) return;

    empty(into);
    into.append(
      message(
        "We couldn't read your settings",
        "Lens couldn't reach the browser storage your preferences live in. Nothing on this page is affected — try again in a moment.",
        { label: "Try again", onClick: retry },
      ),
    );

    return;
  }

  /*
   * Waited for, then asked for. The badge is drawn as soon as the card is,
   * which is before the interceptor's copy of FINN's response has reached
   * storage — so on a listing the reader can very reasonably click a car we
   * are about to know about, and a moment's wait answers that. A car FINN
   * never sent us is fetched outright, the way the pin button has always
   * fetched it. See `resolveCar`.
   */
  if (!isCurrent()) return;

  const car = await resolveCar(request.carId, {
    waitMs: CAR_WAIT_MS,
    fetchIfMissing: true,
  });

  if (!isCurrent()) return;

  if (!car) {
    empty(into);
    into.append(
      message(
        "We couldn't load this car",
        "Lens asked FINN for it and didn't get an answer it could use. That is usually the connection rather than the car — try again in a moment.",
        {
          label: "Try again",
          onClick: retry,
        },
      ),
    );

    return;
  }

  /*
   * Whose answers, from the one place every surface reads it: the chat's
   * while it has a result, the saved settings otherwise (`judging.ts`).
   */
  const judging = await currentJudging();

  if (!isCurrent()) return;

  /* Marked, not scrolled to: the card is already under the reader's cursor. */
  highlightConfiguration(car.id);

  const { answers } = judging;

  empty(into);
  into.append(
    judgedBy(judging, car as never, retry),
    analysisBody(
      buildFitAnalysis(car, answers.priorities, answers.preferences, answers.features),
      /* The defaults notice is about the settings; it says nothing true of a chat's answers. */
      configured || judging.by === "chat" ? null : defaultsNotice(openSetup),
    ),
  );

  into.scrollTop = 0;

  /*
   * The pin button, docked below the analysis rather than inside it.
   *
   * It used to sit in the header, directly under the verdict, on the reasoning
   * that a reader just told a car suits them is the reader who wants to keep
   * it. That was true and it was in the wrong place: the decision it asks for
   * is made *after* reading — the cost, what the car uses, the compromises —
   * and by then the button was several screens up, so acting on the answer
   * meant scrolling back to the top of it.
   *
   * Outside the scroller, so it stays put while the analysis moves under it and
   * is reachable at any point in a long read. Its `pinControl` is rebuilt with
   * the rest of the panel on every render, which is what keeps it pointed at
   * the car currently on screen.
   */
  dock.append(pinControl(car as never));
}


/**
 * Whose answers this verdict is by, and the other one a tap away.
 *
 * The chat and the settings can disagree about the same car, and a panel that
 * doesn't say which it is using leaves the reader to guess why it contradicts
 * the conversation they just had. The switch holds for every badge and page
 * until the chat's next result.
 */
function judgedBy(judging: Judging, car: Parameters<typeof setAsideByChat>[1], redraw: () => void): HTMLElement {
  const label = judgingLabel(judging);
  const ruledOut = setAsideByChat(judging, car);
  const rules = judging.by === "chat" ? judging.session.rules.map((rule) => rule.label.toLowerCase()).join(", ") : "";

  return el(
    "div",
    {
      class:
        "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-finn-pale-blue px-3 py-2 text-[12px] leading-5",
    },
    [
      el("div", { class: "min-w-0" }, [
        el("p", { class: "font-black text-finn-accent-blue", text: label.long }),
        ...(ruledOut
          ? [
              el("p", {
                class: "text-finn-iron",
                text: `Your chat set this car aside (${rules}), so it wouldn't be in its comparison. Here's how it would fit otherwise.`,
              }),
            ]
          : []),
      ]),
      ...(label.switchTo
        ? [
            el("button", {
              class:
                "shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-black text-finn-accent-blue ring-1 ring-finn-cotton hover:bg-white/70",
              attrs: { type: "button" },
              text: label.switchTo,
              on: {
                click: () => {
                  void judgeBy(judging.by === "chat" ? "settings" : "chat").then(redraw);
                },
              },
            }),
          ]
        : []),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* The drawer                                                                 */
/* -------------------------------------------------------------------------- */

/** A strip down the right where there is room for one, and a sheet where there isn't. */
function hostStyle(): string {
  return hasRoomBeside(PANEL_WIDTH)
    ? `position:fixed;top:0;right:0;bottom:0;width:${PANEL_WIDTH}px;z-index:2147483000;`
    : "position:fixed;inset:0;z-index:2147483000;";
}

async function build(request: PanelRequest): Promise<Panel> {
  const host = el("div", { attrs: { id: HOST_ID } });

  /*
   * A strip down the right, not a sheet over everything.
   *
   * The host used to cover the viewport so a backdrop could fill it. Nothing
   * outside the panel's own width is ours to occupy: the page beside it stays
   * clickable, scrollable and selectable, which is the entire point of a
   * strip rather than a modal.
   *
   * What it covers, it covers — including the card the panel is about. That
   * card's section used to be narrowed so it reflowed clear; see `panel-width`
   * for why nothing on finn.com moves any more.
   *
   * On a narrow viewport there is no room to sit beside anything, so it
   * covers the page instead.
   */
  host.style.cssText = hostStyle();

  const shadow = host.attachShadow({ mode: "open" });

  shadow.append(el("style", { text: await panelStyles() }));

  const scroller = el("div", {
    class: "min-h-0 flex-1 overflow-y-auto overscroll-contain",
  });

  /*
   * The one action the panel asks for, held at the bottom of it.
   *
   * Empty until there is a car, and it draws no border or padding of its own
   * when empty — `:empty` rather than a flag this file has to remember to
   * set, so a render that leaves it unfilled cannot leave a strip of white
   * across the foot of the panel.
   */
  const dock = el("div", {
    class: [
      "shrink-0 border-t border-finn-cotton bg-white px-5 py-3",
      "[&:empty]:hidden",
    ].join(" "),
  });

  const close = () => closePanel();

  const closeButton = el(
    "button",
    {
      class: [
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        "text-finn-iron transition-colors hover:bg-finn-cotton hover:text-finn-black",
      ].join(" "),
      attrs: { type: "button", "aria-label": "Close Finn Lens" },
      on: { click: close },
    },
    [icon("x", "h-4 w-4")],
  );

  /*
   * A heading, not a paragraph. It is the region's accessible name and the
   * top of its outline — the priorities inside it are h3s — so a reader
   * navigating by heading should be able to land on it.
   */
  const title = el("h2", {
    class: "m-0 text-[13px] font-black text-finn-black",
    attrs: { id: "finn-lens-title" },
    text: "How this car fits you",
  });

  const bar = el(
    "div",
    {
      class:
        "flex items-center gap-2 border-b border-finn-cotton px-5 py-3",
    },
    [
      /* The mark, not a magnifier. This bar is the first line of a panel that
         opens over finn.com, and it has to say whose panel it is before it
         says what the panel is about — see `brandMark`.

         Deliberately larger than the 13px heading beside it rather than
         matched to it. At icon size it read as one more piece of the bar's
         furniture, in a row that already ends in two controls; as a 28px disc
         it is the first thing in the panel, which is what a reader arriving
         from FINN's own page needs it to be. */
      brandMark(28, "", { idle: true }),
      el("div", { class: "min-w-0 flex-1" }, [title]),
      el("button", {
        class: [
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
          "text-finn-iron transition-colors hover:bg-finn-cotton hover:text-finn-black",
        ].join(" "),
        attrs: { type: "button" },
        text: "Settings",
        on: { click: openSettings },
      }),
      closeButton,
    ],
  );

  /*
   * A region beside the page, not a dialog over it.
   *
   * `aria-modal` would now be a lie, and a lie that costs something: it tells
   * a screen reader everything else on the page is inert, when in fact the
   * reader is meant to be reading FINN's page alongside this. A labelled
   * complementary region is what this actually is.
   */
  /*
   * Slides in from the right edge and back out the same way, like every other
   * drawer in the product: `finn-lens-drawer` keyed on `data-state`, from the
   * DRAWER block in `assets/tailwind.css` — the same timing, the same easing
   * and the same reduced-motion opt-out as the compare page's Adjust panel.
   * The stylesheet is in the shadow root before the host reaches the page, so
   * the slide-in runs from the first frame.
   */
  const drawer = el(
    "div",
    {
      class: [
        "finn-lens-drawer",
        "absolute inset-0 flex flex-col",
        "bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.08)]",
        "border-l border-finn-cotton",
        "font-sans text-finn-black",
      ].join(" "),
      attrs: {
        role: "complementary",
        "aria-labelledby": "finn-lens-title",
        "data-state": "open",
      },
    },
    [bar, scroller, dock],
  );

  shadow.append(drawer);

  /**
   * Escape closes it, and Tab is left alone.
   *
   * The panel used to trap Tab, which is right for a modal and wrong for
   * this: the page beside it is meant to be reachable, and a reader who tabs
   * off the end of the panel should land on finn.com rather than being sent
   * back to the top of a region they have finished with.
   *
   * Escape is listened for on the window rather than on the host, because
   * focus may well be out in the page when the reader reaches for it.
   */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;

    event.stopPropagation();
    close();
  };

  window.addEventListener("keydown", onKeyDown, true);

  /*
   * A window wide enough for a strip can stop being one — a resize, or
   * devtools opening beside the page — so the shape is re-decided rather than
   * decided once.
   */
  const onResize = () => {
    host.style.cssText = hostStyle();
  };

  window.addEventListener("resize", onResize);

  /*
   * Which car the panel is currently about. It changes without the panel
   * being rebuilt: a reader clicking through the verdicts on a list is asking
   * the same question of one car after another, and tearing the panel down
   * and building it again between each would throw away the scroll position,
   * the styles and the room the page has already made.
   */
  let current = request;

  /* Bumped by every render and by closing; see `render`'s `isCurrent`. */
  let generation = 0;

  const retry = () => {
    const mine = (generation += 1);

    void render(scroller, dock, retry, current, () => mine === generation);
  };

  const show = (next: PanelRequest) => {
    current = next;

    retry();
  };

  /*
   * Settings changed in the options tab reach an open panel, which is what
   * makes the setup prompt a step rather than a dead end.
   */
  const onStorageChanged = (
    changes: Record<string, unknown>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    if (WATCHED_KEYS.some((key) => key in changes)) retry();
  };

  browser.storage.onChanged.addListener(onStorageChanged);

  const remove = () => host.remove();

  const destroy = () => {
    generation += 1;

    closeInfoTip();

    browser.storage.onChanged.removeListener(onStorageChanged);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("resize", onResize);

    /* The card gets its own colour back. */
    clearHighlight();

    /*
     * Out the way it came, and off the page once it has gone. Nothing in it
     * can be clicked on the way out: the reader has already said they are
     * done with it, and a stray click on a panel that is leaving would act
     * on a car they have closed.
     */
    drawer.style.pointerEvents = "none";
    drawer.setAttribute("data-state", "closed");

    /* No slide to wait for: the reader asked for less movement, or the styles never loaded. */
    if (getComputedStyle(drawer).animationName === "none") {
      remove();
      return;
    }

    /* Its own slide only: `animationend` bubbles, and the spinner inside it animates too. */
    drawer.addEventListener("animationend", (event) => {
      if (event.target === drawer) remove();
    });
    window.setTimeout(remove, SLIDE_OUT_MAX_MS);
  };

  retry();

  document.body.append(host);
  closeButton.focus();

  return { show, destroy, remove };
}

/* -------------------------------------------------------------------------- */
/* Opening and closing                                                        */
/* -------------------------------------------------------------------------- */

let opener: Element | null = null;

/**
 * A panel still being built — `build` waits for the stylesheet — and what has
 * been asked of it in the meantime. Without these a second click in that
 * window built a second panel on top of the first, and a close (Escape, or a
 * navigation) did nothing, so the panel appeared after the reader had left.
 */
let building: Promise<void> | null = null;
let queued: PanelRequest | null = null;
let cancelled = false;

export async function openPanel(request: PanelRequest): Promise<void> {
  /*
   * An open panel is pointed at the new car rather than left showing the old
   * one. Returning early here was a bug the badges made obvious: every card
   * on a list has a button, and clicking the second one did nothing at all.
   */
  if (open) {
    open.show(request);
    return;
  }

  /* The latest click wins once the panel is up, and reopens a cancelled one. */
  if (building) {
    queued = request;
    cancelled = false;
    return building;
  }

  /* One still sliding out goes at once, so two never overlap on the page. */
  closing?.remove();
  closing = null;

  opener = document.activeElement;

  building = (async () => {
    try {
      const panel = await build(request);

      if (cancelled) {
        panel.destroy();
        panel.remove();
        return;
      }

      open = panel;

      if (queued) panel.show(queued);
    } finally {
      building = null;
      queued = null;
      cancelled = false;
    }
  })();

  return building;
}

export function closePanel(): void {
  if (!open) {
    if (building) cancelled = true;
    return;
  }

  const leaving = open;

  open = null;
  closing = leaving;
  leaving.destroy();

  if (opener instanceof HTMLElement && opener.isConnected) opener.focus();

  opener = null;
}
