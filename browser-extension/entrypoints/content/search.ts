import { FALLBACK_VOCABULARY, readFinnSearch, vocabularyFrom, type FinnSearch, type FinnVocabulary } from "@/lib/finn-search";

import { DETAILS_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR } from "./constants";
import { loadFilterVocabulary } from "./injectors/inject-pin-button/injectPinCarButtonIntoNode/api";

/**
 * The search the reader has set up on this finn.com page, if any.
 *
 * Only on a listing and on a car's own page: those are where the address
 * carries filters, and where Lens is used to decide. FINN's vocabulary is
 * asked for once per page load — brands and models change, and a listing's
 * path is written in slugs of them — and if FINN won't give it, Lens still
 * reads everything but brands and models from what it already knows.
 */

let vocabulary: Promise<FinnVocabulary> | null = null;

function filterVocabulary(): Promise<FinnVocabulary> {
    vocabulary ??= loadFilterVocabulary()
        .then(vocabularyFrom)
        .catch((error: unknown) => {
            console.error("[FinnLens] couldn't read FINN's filter values", error);
            /* Try again next time rather than keep a half vocabulary all visit. */
            vocabulary = null;
            return FALLBACK_VOCABULARY;
        });

    return vocabulary;
}

export const onSearchPage = (): boolean =>
    Boolean(document.querySelector(LISTINGS_PAGE_SELECTOR) || document.querySelector(DETAILS_PAGE_SELECTOR));

export const onListing = (): boolean => Boolean(document.querySelector(LISTINGS_PAGE_SELECTOR));

export async function currentSearch(): Promise<FinnSearch | null> {
    if (!onSearchPage()) return null;

    return readFinnSearch(window.location.href, await filterVocabulary());
}
