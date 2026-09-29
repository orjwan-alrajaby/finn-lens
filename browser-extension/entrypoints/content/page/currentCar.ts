import type { FinnCar, PinnedFinnCar } from "@/lib/types";

import { DETAILS_PAGE_SELECTOR } from "../constants";
import { mapFinnConfigToAll } from "../manipulateApiData";
import { loadCarsFromFinnApi } from "../data/api";
import {
  getLoadedCars,
  mergeLoadedCars,
} from "../data/cache";
import {
  buildCarUrl,
  extractConfigId,
} from "../data/utils";
import { getPageContext } from "../data/page-context";

/**
 * Which car the reader is actually looking at, and what we know about it.
 *
 * The pin button never had to answer this: it is attached to an element that
 * carries its own config id, so it always knows which car was clicked. The
 * analysis panel is opened from nowhere in particular and has to work the
 * current car out from the page, which is the one genuinely new piece of DOM
 * reasoning in this feature — so it is kept in one file, ordered from the most
 * reliable signal to the least, and it returns `null` rather than a guess.
 */

/** Every card FINN draws that stands for one car the reader could open. */
export const CARD_SELECTORS = [
  '[data-testid="product-card"]',
  '[data-testid="group-comparison"] [id^="product-"]',
].join(",");

/**
 * The config id a card stands for.
 *
 * Listing cards carry it inside `data-productid`
 * ("byd-dolphin-36933-obsidianblack") and configuration cards inside their own
 * `id` ("product-34889") — which is exactly what the pin button already reads
 * from each, so nothing that marks a card can disagree with anything else
 * about which car it is.
 */
export function cardConfigId(card: HTMLElement): number | null {
  const own = /^product-(\d+)$/.exec(card.id)?.[1];

  if (own) return Number(own);

  return extractConfigId(card.dataset.productid ?? "");
}

/**
 * The name FINN prints on a card, for the panel's loading state.
 *
 * A hint and nothing more: it names what is being loaded while it loads, and
 * is thrown away the moment the real car arrives. Every word of the analysis
 * itself comes from the car FINN sent, never from the page — the page is
 * markup we don't own and can't hold to a shape.
 *
 * `h3` on a listing card; a configuration card has no name of its own, since
 * the model page's own heading carries it.
 */
export function cardName(card: HTMLElement): string | undefined {
  const heading = card.querySelector("h3")?.textContent?.trim();

  return heading || undefined;
}

/** The card on this page for one car, wherever FINN drew it. */
export function cardForCar(id: number): HTMLElement | null {
  const byId = document.getElementById(`product-${id}`);

  if (byId) return byId;

  for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTORS)) {
    if (cardConfigId(card) === id) return card;
  }

  return null;
}

/**
 * The part of a card FINN puts the photograph in.
 *
 * Two shapes, because there are two kinds of card: a listing card wraps its
 * media block one level deeper than a configuration card does. Rather than
 * guess which is which, both candidates are tried in order and each is checked
 * for actually holding the image — a selector that matches the wrong block
 * would put the verdict pill over the price.
 *
 * Falls back to the card itself, which is positioned too, so a card built some
 * third way gets its mark in a corner rather than not at all.
 */
export function cardPhoto(card: HTMLElement): HTMLElement {
  const candidates = [
    ":scope > div:first-child > div:first-child",
    ":scope > div:first-child",
  ];

  for (const selector of candidates) {
    const block = card.querySelector<HTMLElement>(selector);

    if (block?.querySelector("img")) return block;
  }

  return card;
}

/**
 * The details page root, or null when this isn't one.
 *
 * Not exported any more: the panel used to ask for it directly, to read the
 * whole page as a set of configurations. It now only serves as the fallback
 * anchor in `resolveCar` for a car FINN never drew a card for.
 */
function detailsPageRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(DETAILS_PAGE_SELECTOR);
}


/**
 * One car by id: from what we have, then from what is arriving, then by
 * asking FINN.
 *
 * Three steps because there are three genuinely different reasons the car
 * might not be in hand, and only the last of them is a dead end.
 *
 * **We already have it.** Usually true. The interceptor keeps a copy of every
 * car FINN's own pages fetch, so the car the reader clicked was very likely
 * kept when the page that drew it loaded.
 *
 * **It is on its way.** The button that leads here is drawn the moment the
 * card exists — the same moment the pin button appears — while the data
 * arrives separately, when the interceptor's copy reaches storage. A miss in
 * that window is not "we don't have this car", it is "not yet", and the gap
 * is a few hundred milliseconds. Waiting costs nothing and asks FINN nothing.
 *
 * **FINN never sent it.** Which happens: a card drawn from markup rather than
 * from a response we saw, a cache cleared underneath us, a page that fetched
 * before the interceptor was installed. This used to give up here, on the
 * reasoning that a request would be asking FINN twice for something it had
 * already sent — true of the first two cases and false of this one. The pin
 * button has always fetched in exactly this situation, using exactly this
 * helper, so a reader could pin a car that Lens then claimed not to know
 * about. Now both ask.
 *
 * The badges still never fetch. Forty cards on a listing are not forty
 * reasons to call FINN's API — the request happens when a reader asks about
 * one car, which is one request for one deliberate act.
 */
export async function resolveCar(
  id: number,
  {
    waitMs = 0,
    fetchIfMissing = false,
  }: { waitMs?: number; fetchIfMissing?: boolean } = {},
): Promise<PinnedFinnCar | null> {
  try {
    const found = await readCar(id);

    if (found) return found;

    if (waitMs > 0) {
      const arrived = await waitForCar(id, waitMs);

      if (arrived) return arrived;
    }

    return fetchIfMissing ? await fetchCar(id) : null;
  } catch (error) {
    console.error("[FinnLens] couldn't read what we know about a car", error);

    return null;
  }
}

/**
 * Ask FINN for one car, the way the pin button does.
 *
 * The context comes from the card the reader clicked, so this takes whichever
 * of `loadCarsFromFinnApi`'s branches the pin button would have taken from
 * the same element — the listing fetch, the `swap_config_id` fetch, or the
 * whole-model fetch off a configuration card. Falling back to the details
 * page root covers a card that has since been redrawn out from under us: that
 * anchor resolves to the `swap_config_id` branch, which names this car
 * exactly.
 *
 * Whatever comes back is merged into the cache, so the next reader of this
 * car — a badge pass, another panel, the pin button — finds it without
 * asking again.
 */
async function fetchCar(id: number): Promise<PinnedFinnCar | null> {
  const anchor = cardForCar(id) ?? detailsPageRoot();

  if (!anchor) return null;

  const response = await loadCarsFromFinnApi({
    ...getPageContext(anchor),
    anchorElement: anchor,
    carConfigId: id,
  });

  const mapped = mapFinnConfigToAll(response.results);

  await mergeLoadedCars(mapped);

  /* Keyed lookup first, then by id — the same belt and braces the pin button uses. */
  const car =
    mapped[id] ?? Object.values(mapped).find((item) => item.id === id);

  return car ? asEvaluatable(car) : null;
}

/** What storage holds for one car right now. */
async function readCar(id: number): Promise<PinnedFinnCar | null> {
  const cached = (await getLoadedCars())[id];

  return cached ? asEvaluatable(cached) : null;
}

/**
 * Wait for a car to arrive, or give up.
 *
 * Driven by the storage event rather than by polling: the only thing that can
 * make this car appear is a write, so a write is the only thing worth waking
 * up for. The timeout is what stops a car FINN never sent from leaving the
 * panel spinning — past it the reader gets told plainly that we don't have it.
 */
function waitForCar(
  id: number,
  waitMs: number,
): Promise<PinnedFinnCar | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (car: PinnedFinnCar | null) => {
      if (settled) return;

      settled = true;

      clearTimeout(timer);
      browser.storage.onChanged.removeListener(onChanged);

      resolve(car);
    };

    const onChanged = (
      changes: Record<string, unknown>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;

      if (!("loadedCarsFromFinnApi" in changes)) return;

      void readCar(id).then((car) => {
        if (car) finish(car);
      });
    };

    const timer = setTimeout(() => finish(null), waitMs);

    browser.storage.onChanged.addListener(onChanged);

    /* Re-checked after subscribing, so a write in between isn't missed. */
    void readCar(id).then((car) => {
      if (car) finish(car);
    });
  });
}

/**
 * The engine's vehicle type is `PinnedFinnCar` because the Compare flow is the
 * only thing that has ever fed it cars, and everything it pins has a URL and a
 * pinned date. Neither field is read by any scoring, costing or narrative
 * function — the analysis needs the same car whether or not it was pinned.
 *
 * So rather than widening every signature in the engine (and with it the
 * Compare page's `winner.url`, which is a genuine pinned-car field), the two
 * are filled in here: the URL is the page the reader is on, which is true, and
 * an empty pinned date says plainly that this car isn't pinned.
 */
function asEvaluatable(car: FinnCar): PinnedFinnCar {
  return {
    ...car,
    url: buildCarUrl(window.location.href, car.id),
    pinnedAt: "",
  };
}
