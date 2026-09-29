import { searchQuery, type FinnSearch } from "@/lib/finn-search";

import { mapFinnConfigToAll } from "./manipulateApiData";
import { CARD_SELECTORS, cardConfigId } from "./page/currentCar";
import { DETAILS_PAGE_SELECTOR } from "./constants";
import {
    loadCarByConfigId,
    loadCarPage,
    loadSearchCars,
    type FinnCarsResponse,
} from "./data/api";
import { currentSearch, onListing } from "./search";
import {
    getLoadedCars,
    mergeLoadedCars,
} from "./data/cache";

/**
 * Making sure Lens holds the cars the page is showing.
 *
 * Lens's data normally arrives for free: the interceptor copies every
 * `/api/cars` response FINN's own pages fetch. What that misses is everything
 * FINN rendered on its server — the first screen of a listing, a page opened
 * from a link, a page restored from the back-forward cache — and those cards
 * are exactly the ones a reader points at first. Until now each surface
 * papered over the gap on its own: the pin button fetched when pressed, the
 * panel fetched when opened, the badges gave up and asked "how does it fit?",
 * and Ask Lens said it had no cars on a page full of them.
 *
 * So this is the one place that fills the gap, for all of them:
 *
 * - `ensureCarsFor` takes the ids a page is showing and asks FINN only for
 *   what Lens is missing;
 * - `ensurePageCars` does that for whatever the page is showing right now,
 *   which the content script repeats as a listing draws more cards.
 *
 * Two shapes of request, in order of what they cost. A page of FINN's
 * ungrouped list covers a whole listing screen at once; anything still
 * missing after that — a filtered page whose cars sit deep in the unfiltered
 * list — is asked for one id at a time, and only a few of those.
 */

/** How far into FINN's list a page fill will read before giving up on paging. */
const PAGE_SIZE = 200;
const MAX_PAGES = 3;

/** The most single-car requests one fill will make after paging. */
const MAX_BY_ID = 12;
const BY_ID_AT_ONCE = 4;

/**
 * Ids this page has already asked FINN for, whatever came back.
 *
 * A card whose car FINN won't return — sold, withdrawn, filtered out of the
 * list — must not become a request on every scroll, every badge pass and
 * every time the chat re-reads the page.
 */
const asked = new Set<number>();

/** One fill at a time: several surfaces notice the same gap at the same moment. */
let filling: Promise<number> | null = null;

const known = async (): Promise<Set<number>> => {
    return new Set(Object.keys(await getLoadedCars()).map(Number));
};

/**
 * Stores what came back — but only the cars asked for, when reading a list.
 *
 * A page of FINN's list is two hundred cars and the reader is looking at
 * twenty-four of them. Keeping all of it would spend the extension's storage
 * budget on cars nobody has seen; the ones they scroll to are fetched when
 * they appear. Answers with every id the response carried, so the caller can
 * tell what it no longer has to look for.
 */
async function keep(response: FinnCarsResponse, onlyIds?: Set<number>): Promise<number[]> {
    const results = Array.isArray(response?.results) ? response.results : [];

    if (!results.length) return [];

    const mapped = mapFinnConfigToAll(results);
    const ids = Object.values(mapped).map((car) => car.id);

    const kept = onlyIds
        ? Object.fromEntries(Object.entries(mapped).filter(([, car]) => onlyIds.has(car.id)))
        : mapped;

    if (Object.keys(kept).length) await mergeLoadedCars(kept);

    return ids;
}

/**
 * Makes sure Lens has every car in `ids`, and answers with how many it had to
 * fetch. Ids Lens already holds cost nothing; ids FINN doesn't return are
 * remembered, so the next caller doesn't ask again.
 */
export async function ensureCarsFor(ids: number[]): Promise<number> {
    const wanted = [...new Set(ids)].filter((id) => Number.isFinite(id) && id > 0);

    if (!wanted.length) return 0;

    /* Queued rather than run twice: the second caller wants the first one's result. */
    const run = async (): Promise<number> => {
        const have = await known();
        let missing = wanted.filter((id) => !have.has(id) && !asked.has(id));

        if (!missing.length) return 0;

        for (const id of missing) asked.add(id);

        let found = 0;

        try {
            for (let page = 0; page < MAX_PAGES && missing.length; page += 1) {
                const stored = await keep(await loadCarPage(page * PAGE_SIZE, PAGE_SIZE), new Set(missing));

                if (!stored.length) break;

                const arrived = new Set(stored);

                found += missing.filter((id) => arrived.has(id)).length;
                missing = missing.filter((id) => !arrived.has(id));

                /* A short page is the end of FINN's list; there is nothing further to read. */
                if (stored.length < PAGE_SIZE) break;
            }

            /* Whatever the list didn't cover — a filtered page, a car deep in the order. */
            for (let index = 0; index < Math.min(missing.length, MAX_BY_ID); index += BY_ID_AT_ONCE) {
                const batch = missing.slice(index, index + BY_ID_AT_ONCE);
                const results = await Promise.all(
                    batch.map((id) =>
                        loadCarByConfigId(id)
                            .then(keep)
                            .catch(() => [] as number[]),
                    ),
                );

                found += results.flat().length;
            }
        } catch (error) {
            /*
             * A request that failed is not a car FINN won't give: let the next
             * scroll, badge pass or chat try again. Only ids FINN answered
             * without stay remembered.
             */
            for (const id of missing) asked.delete(id);

            /* The page still works; Lens simply says how many cars it has. */
            console.error("[FinnLens] couldn't load this page's cars", error);
        }

        return found;
    };

    filling = (filling ?? Promise.resolve(0)).then(run, run);

    return filling;
}

/** Every configuration id the page is currently showing. */
export function pageCarIds(): number[] {
    const ids = new Set<number>();

    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTORS)) {
        const id = cardConfigId(card);

        if (id != null) ids.add(id);
    }

    /* A details page names its configurations in its own markup, not in cards. */
    for (const node of document.querySelectorAll<HTMLElement>(`${DETAILS_PAGE_SELECTOR} [id^="product-"]`)) {
        const id = Number(/^product-(\d+)$/.exec(node.id)?.[1]);

        if (Number.isFinite(id) && id > 0) ids.add(id);
    }

    return [...ids];
}

/* -------------------------------------------------------------------------- */
/* A filtered listing                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The most configurations one search brings into Lens. A search narrow enough
 * to decide within is well under this; one that isn't (all petrol cars) is
 * compared on the first this many FINN lists, and the chat says so.
 */
const MAX_SEARCH_CARS = 150;

export interface SearchCars {
    ids: number[];
    /** How many FINN says match — more than `ids` when the search is broad. */
    total: number;
}

const searched = new Map<string, Promise<SearchCars>>();

/**
 * Every configuration FINN lists for the reader's search, held by Lens.
 *
 * A listing draws one card per model, twenty-four at a time, and only as the
 * reader scrolls; the search behind it is the whole of what they asked FINN
 * for — "electric SUVs with a towbar, €770–950" is four configurations, all
 * known the moment the page opens. One request per search, remembered for the
 * visit, and it also covers the cards the page draws.
 */
export function ensureSearchCars(search: FinnSearch): Promise<SearchCars> {
    const query = searchQuery(search);
    let pending = searched.get(query);

    if (!pending) {
        pending = loadSearchCars(query, MAX_SEARCH_CARS)
            .then(async (response) => ({
                ids: [...new Set(await keep(response))],
                total: Number(response?.total_results) || 0,
            }))
            .catch((error: unknown) => {
                /* Not remembered: a failed request is worth making again. */
                searched.delete(query);
                console.error("[FinnLens] couldn't load the cars for this search", error);
                return { ids: [], total: 0 };
            });

        searched.set(query, pending);
    }

    return pending;
}

/**
 * Fills in whatever the page is showing right now. Safe to call often.
 *
 * On a filtered listing the search goes first: one request brings every car
 * that matches, cards included, and what's left for card-by-card filling is
 * nothing, or nearly.
 */
export async function ensurePageCars(): Promise<number> {
    if (onListing()) {
        const search = await currentSearch();

        if (search) await ensureSearchCars(search);
    }

    return ensureCarsFor(pageCarIds());
}

/** Forgets what this page asked for, so a new page starts clean. */
export const forgetAsked = (): void => asked.clear();
