/**
 * What the reader asked finn.com for, read off the page's address.
 *
 * FINN keeps a listing's filters in its URL: the categorical ones as slugs in
 * the path — `/subscribe/mg/cabriolet_automatik_elektro_14-days` — and the
 * rest in the query — `?features=hitch&mileage_package=1500&max_price=950`.
 * A car page reached from a filtered listing carries the same filters in
 * FINN's API form instead: `/models/bmw/ix1?cartypes=SUV&fuels=Elektro&terms=6`.
 *
 * Both are what a person chose, one control at a time, before Lens said a
 * word — a budget, a contract length, a mileage package, a towbar. Reading
 * them means Lens starts the conversation already knowing them, instead of
 * asking the reader to repeat what they have just told the page.
 *
 * The path is read the way FINN reads it (`parseFilterGroups` in FINN's own
 * front end, which this follows step by step):
 *
 * - everything after `subscribe/` is split into segments at `/`, and each
 *   segment into tokens at anything that isn't a letter, digit, hyphen,
 *   bracket, space or umlaut — so `.` separates brands and `_` everything else;
 * - each token is looked up in a table of slugs built from the filter values
 *   FINN offers (`/api/filters/cars`), slugged the way FINN slugs them:
 *   umlauts spelled out, spaces, dots and hashes turned into hyphens,
 *   lower-cased — so "3er Limousine" is `3er-limousine`;
 * - contract lengths are `6-monate` (`6-months` in English), and a handful of
 *   words stand for switches: `hitch`, `14-days`, `30-days`, `fast-available`,
 *   `young-driver`, `deals`;
 * - brands and models are only read from the first segment. The second holds
 *   everything else, and a model that shares a slug with a body style must not
 *   be read out of it.
 *
 * Nothing here decides what a filter means for the reader: Lens judges the
 * cars a search returns, and reads nothing else into it. This only says what
 * was filtered.
 */

/** The values FINN offers to filter by, as `/api/filters/cars` lists them. */
export interface FinnVocabulary {
    brands: string[];
    models: string[];
    cartypes: string[];
    fuels: string[];
    gearshifts: string[];
    terms: number[];
    productGroups: string[];
}

/**
 * What Lens can read without asking FINN: every value its filter panel showed
 * when this was written. Brands and models change weekly, so those come from
 * FINN on the page; without them, a brand in the path is simply not read.
 */
export const FALLBACK_VOCABULARY: FinnVocabulary = {
    brands: [],
    models: [],
    cartypes: ["SUV", "Klein- und Kompaktwagen", "Kombi", "Van", "Limousine", "Cabriolet", "Coupé", "Estate", "Sedan"],
    fuels: ["Benzin", "Diesel", "Elektro", "Plug-In-Hybrid"],
    gearshifts: ["Automatik", "Manuell"],
    terms: [1, 3, 6, 9, 12, 13, 18, 24],
    productGroups: ["earlybooking", "MILAGEDEAL", "BMWDEALS"],
};

/** The vocabulary as FINN sends it: brands as objects, everything else as plain lists. */
export function vocabularyFrom(raw: unknown): FinnVocabulary {
    const data = (raw ?? {}) as Record<string, unknown>;
    const strings = (value: unknown): string[] =>
        Array.isArray(value)
            ? value
                  .map((item) => (typeof item === "string" ? item : typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : null))
                  .filter((item): item is string => Boolean(item))
            : [];
    const numbers = (value: unknown): number[] =>
        Array.isArray(value) ? value.map(Number).filter((item) => Number.isFinite(item) && item > 0) : [];

    const merged = (mine: string[], fallback: string[]) => [...new Set([...mine, ...fallback])];

    return {
        brands: strings(data.brands),
        models: strings(data.models),
        cartypes: merged(strings(data.cartypes), FALLBACK_VOCABULARY.cartypes),
        fuels: merged(strings(data.fuels), FALLBACK_VOCABULARY.fuels),
        gearshifts: merged(strings(data.gearshifts), FALLBACK_VOCABULARY.gearshifts),
        terms: [...new Set([...numbers(data.terms), ...FALLBACK_VOCABULARY.terms])],
        productGroups: merged(strings(data.product_group), FALLBACK_VOCABULARY.productGroups),
    };
}

/** What the reader filtered for. Every list is empty and every value null when they didn't. */
export interface FinnSearch {
    brands: string[];
    models: string[];
    cartypes: string[];
    fuels: string[];
    gearshifts: string[];
    /** Contract lengths in months. */
    terms: number[];
    /** FINN's offer groups: "earlybooking", "MILAGEDEAL"… */
    productGroups: string[];
    /** FINN's own feature ids: "hitch", "360_camera", "automatic_parking"… */
    features: string[];
    colors: string[];
    seats: number[];
    doors: number[];
    /** The monthly price range, in euros, as FINN's slider sets it. */
    minPrice: number | null;
    maxPrice: number | null;
    /** Kilometres a month the prices are shown for. */
    mileagePackage: number | null;
    minEvRange: number | null;
    maxEvRange: number | null;
    /** "Available within 14 days" is an `available_to` date; "from October" an `available_from` month. */
    availableFrom: string | null;
    availableTo: string | null;
    youngDriver: boolean;
    fastAvailable: boolean;
    business: boolean;
    deals: boolean;
}

export const EMPTY_SEARCH: FinnSearch = {
    brands: [],
    models: [],
    cartypes: [],
    fuels: [],
    gearshifts: [],
    terms: [],
    productGroups: [],
    features: [],
    colors: [],
    seats: [],
    doors: [],
    minPrice: null,
    maxPrice: null,
    mileagePackage: null,
    minEvRange: null,
    maxEvRange: null,
    availableFrom: null,
    availableTo: null,
    youngDriver: false,
    fastAvailable: false,
    business: false,
    deals: false,
};

/* -------------------------------------------------------------------------- */
/* FINN's slugs                                                               */
/* -------------------------------------------------------------------------- */

const UMLAUTS: Record<string, string> = { ä: "ae", ë: "e", ü: "ue", é: "e", ö: "oe", ß: "ss" };

/** FINN's `slugify`: "Klein- und Kompaktwagen" → "klein--und-kompaktwagen", "Coupé" → "coupe". */
export const finnSlug = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[äëüéöß]/g, (letter) => UMLAUTS[letter] ?? letter)
        .replace(/[\s.#]/g, "-");

/** The characters a path token is made of; anything else separates tokens. */
const TOKEN = /[a-zA-Z\d\-()\säöëüÄÖÜßË]+/g;

type SlugKey = "brands" | "models" | "cartypes" | "fuels" | "gearshifts" | "terms" | "productGroups" | "switch";

type Switch = "hitch" | "youngDriver" | "fastAvailable" | "deals" | "within14" | "within30";

const SWITCHES: Record<string, Switch> = {
    hitch: "hitch",
    "young-driver": "youngDriver",
    "fast-available": "fastAvailable",
    deals: "deals",
    "14-days": "within14",
    "30-days": "within30",
};

/**
 * Slug → what it stands for. One kind per slug, as in FINN's table: where two
 * kinds share a slug the later one replaces the earlier (models after brands,
 * body styles after models…), and values of the same kind accumulate — two
 * spellings of one model can share a slug.
 */
function slugTable(vocabulary: FinnVocabulary): Map<string, { key: SlugKey; value: string }[]> {
    const table = new Map<string, { key: SlugKey; value: string }[]>();
    const add = (slug: string, key: SlugKey, value: string) => {
        const entries = table.get(slug);

        if (entries?.[0]?.key === key) {
            if (!entries.some((entry) => entry.value === value)) entries.push({ key, value });
            return;
        }

        table.set(slug, [{ key, value }]);
    };

    for (const value of vocabulary.brands) add(finnSlug(value), "brands", value);
    for (const value of vocabulary.models) add(finnSlug(value), "models", value);
    for (const value of vocabulary.cartypes) add(finnSlug(value), "cartypes", value);
    for (const value of vocabulary.fuels) add(finnSlug(value), "fuels", value);
    for (const value of vocabulary.gearshifts) add(finnSlug(value), "gearshifts", value);
    for (const value of vocabulary.productGroups) add(finnSlug(value), "productGroups", value);

    for (const term of vocabulary.terms) {
        add(`${term}-${term > 1 ? "monate" : "monat"}`, "terms", String(term));
        add(`${term}-${term > 1 ? "months" : "month"}`, "terms", String(term));
    }

    for (const slug of Object.keys(SWITCHES)) add(slug, "switch", SWITCHES[slug]!);

    return table;
}

/* -------------------------------------------------------------------------- */
/* Reading an address                                                         */
/* -------------------------------------------------------------------------- */

const list = (params: URLSearchParams, key: string): string[] =>
    params
        .getAll(key)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean);

const count = (value: string | null): number | null => {
    if (value == null || value.trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
};

const yes = (value: string | null) => value === "true" || value === "1" || value === "on";

const addAll = <T>(target: T[], values: T[]) => {
    for (const value of values) if (!target.includes(value)) target.push(value);
};

/** "2026-10-07" from a date, the way FINN writes `available_to`. */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/**
 * The filters in a finn.com address, or null where there are none.
 *
 * `today` is when "within 14 days" is counted from, as FINN counts it.
 */
export function readFinnSearch(href: string, vocabulary: FinnVocabulary = FALLBACK_VOCABULARY, today = new Date()): FinnSearch | null {
    let url: URL;

    try {
        url = new URL(href);
    } catch {
        return null;
    }

    const search: FinnSearch = structuredClone(EMPTY_SEARCH);

    /* -- The path, on a listing ---------------------------------------------- */

    const path = decodeURIComponent(url.pathname);
    const at = path.indexOf("/subscribe");

    if (at >= 0) {
        const table = slugTable(vocabulary);
        const segments = path
            .slice(at + "/subscribe".length)
            .split("/")
            .filter(Boolean);

        segments.forEach((segment, index) => {
            for (const token of segment.match(TOKEN) ?? []) {
                for (const { key, value } of table.get(finnSlug(token)) ?? []) {
                    /* FINN reads brands and models only from the first segment. */
                    if (index === 1 && (key === "brands" || key === "models")) continue;

                    switch (key) {
                        case "terms":
                            addAll(search.terms, [Number(value)]);
                            break;
                        case "switch":
                            if (value === "hitch") addAll(search.features, ["hitch"]);
                            else if (value === "youngDriver") search.youngDriver = true;
                            else if (value === "fastAvailable") search.fastAvailable = true;
                            else if (value === "deals") search.deals = true;
                            else search.availableTo = isoDay(addDays(today, value === "within14" ? 14 : 30));
                            break;
                        default:
                            addAll(search[key], [value]);
                    }
                }
            }
        });
    }

    /* -- The query: a listing's extra filters, or a car page's whole search --- */

    const params = url.searchParams;

    addAll(search.brands, list(params, "brands"));
    addAll(search.models, list(params, "models"));
    addAll(search.cartypes, list(params, "cartypes"));
    addAll(search.fuels, list(params, "fuels"));
    addAll(search.gearshifts, list(params, "gearshifts"));
    addAll(search.productGroups, list(params, "product_group"));
    addAll(search.features, list(params, "features"));
    addAll(search.colors, list(params, "colors"));
    addAll(
        search.terms,
        list(params, "terms")
            .map(Number)
            .filter((term) => Number.isFinite(term) && term > 0),
    );
    addAll(
        search.seats,
        list(params, "seats")
            .map(Number)
            .filter((seats) => Number.isFinite(seats) && seats > 0),
    );
    addAll(
        search.doors,
        list(params, "doors")
            .map(Number)
            .filter((doors) => Number.isFinite(doors) && doors > 0),
    );

    if (yes(params.get("has_hitch"))) addAll(search.features, ["hitch"]);

    search.minPrice = count(params.get("min_price"));
    search.maxPrice = count(params.get("max_price"));
    search.mileagePackage = count(params.get("mileage_package"));
    search.minEvRange = count(params.get("min_ev_range"));
    search.maxEvRange = count(params.get("max_ev_range"));
    search.availableFrom = params.get("available_from") || search.availableFrom;
    search.availableTo = params.get("available_to") || search.availableTo;
    search.youngDriver ||= yes(params.get("is_young_driver"));
    search.fastAvailable ||= yes(params.get("underutilized"));
    search.business ||= yes(params.get("is_for_business"));
    search.deals ||= yes(params.get("has_deals"));

    search.terms.sort((a, b) => a - b);
    search.seats.sort((a, b) => a - b);
    search.doors.sort((a, b) => a - b);

    return isEmptySearch(search) ? null : search;
}

export const isEmptySearch = (search: FinnSearch): boolean => JSON.stringify(search) === JSON.stringify(EMPTY_SEARCH);

/**
 * The search as FINN's own API takes it, for listing exactly these cars.
 *
 * Lists repeat their key, the way FINN's pages send them. The pricing type is
 * FINN's too: without it, a price range is compared with a different price
 * than the one on screen, and the €770–950 SUVs the page showed came back as
 * none at all.
 */
export function searchQuery(search: FinnSearch): string {
    const params = new URLSearchParams();
    const each = (key: string, values: (string | number)[]) => values.forEach((value) => params.append(key, String(value)));
    const one = (key: string, value: string | number | null | boolean) => {
        if (value != null && value !== false) params.set(key, String(value));
    };

    each("brands", search.brands);
    each("models", search.models);
    each("cartypes", search.cartypes);
    each("fuels", search.fuels);
    each("gearshifts", search.gearshifts);
    each("terms", search.terms);
    each("product_group", search.productGroups);
    each("features", search.features);
    each("colors", search.colors);
    each("seats", search.seats);
    each("doors", search.doors);
    one("min_price", search.minPrice);
    one("max_price", search.maxPrice);
    one("mileage_package", search.mileagePackage);
    one("min_ev_range", search.minEvRange);
    one("max_ev_range", search.maxEvRange);
    one("available_from", search.availableFrom);
    one("available_to", search.availableTo);
    one("is_young_driver", search.youngDriver);
    one("underutilized", search.fastAvailable);
    one("is_for_business", search.business);
    one("has_deals", search.deals);
    params.set("pricing_type", "downpayment");
    params.set("include_dp_discount", "false");

    return params.toString();
}
