import { formatEUR, monthLabel } from "@/lib/reasoning-engine";
import { addMonths, isMonthString, MAX_RENTAL_MONTHS } from "@/lib/reasoning-engine/contract";
import type { FinnSearch } from "@/lib/finn-search";

import { EVIDENCE, type EvidenceId } from "./evidence";
import { purposeOf } from "./guide";
import type { Need, Understanding } from "./understanding";

/**
 * What a reader's finn.com filters tell Lens about them.
 *
 * Someone who has set FINN to electric SUVs with a towbar, €770–950 a month,
 * the 1,500 km package and a six-month contract has answered half of what
 * Lens would ask, one control at a time, before opening the chat. This turns
 * those answers into the same `Understanding` a conversation builds, so the
 * chat — with Lens AI or without — starts from them instead of asking again.
 *
 * Three kinds of thing come out, and the line between them is what Lens can
 * actually check on a car:
 *
 * - **Needs**, where a filter matches evidence Lens reads. Each FINN feature
 *   filter was checked against FINN's own cars (23 September 2026): every car
 *   the "Anhängerkupplung" filter returns lists Lens's towbar, every car the
 *   "Sitzheizung" filter returns lists heated seats, and so on. A need is only
 *   made where that held for all of them.
 * - **Figures**: the top of the price range as a budget, the mileage package
 *   as how far they drive, a single contract length (with a start date, when
 *   the filters give one) as the rental period.
 * - **Context**: everything else they filtered by — brands, colours, offers —
 *   kept and shown back, never scored. Nobody who filters by colour has told
 *   Lens anything it can rank on.
 *
 * What the reader says in the chat always wins. A filter only fills a figure
 * the conversation hasn't, and only ever replaces what an earlier filter put
 * there — so changing a filter on the page updates Lens, and saying "actually
 * €800 is my limit" is never undone by the price slider.
 */

/** Written into every need, figure and line that came from the filters. */
export const FILTER_SAID = "in your filters on finn.com";

/*
 * Written the way `readUnderstanding` writes ids — lower case, hyphens, at
 * most forty characters — because Lens AI hands every need back each turn and
 * its ids go through that slug. "search:feature:4WD" would come back as
 * "search-feature-4wd", stop being recognised as the filter's, and survive the
 * filter being taken off.
 */
const SEARCH_NEED = "search-";

const needId = (key: string) => `${SEARCH_NEED}${key}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

const fromFilters = (said: string | null | undefined): boolean => Boolean(said?.includes(FILTER_SAID));

/**
 * FINN's feature filters, by the id in the address, with the German label the
 * reader clicked and the Lens evidence every matching car lists.
 *
 * Two of them barely narrow anything — "Tempomat" matches 713 of FINN's 715
 * cars, "Einparkhilfe" 699 — so they are needs Lens can show but that can't
 * separate cars. Neither is scored: Lens counts both as equipment a car is
 * expected to have.
 */
const FEATURES: Record<string, { evidence: EvidenceId; finn: string }> = {
    "360_camera": { evidence: "hasThreeSixtyDegreesCamera", finn: "360°-Kamera" },
    "4WD": { evidence: "hasAllWheelDrive", finn: "Allradantrieb" },
    adaptive_cruise_control: { evidence: "hasCruiseControl", finn: "Tempomat" },
    automatic_parking: { evidence: "hasParkingAssistant", finn: "Einparkhilfe" },
    glass_roof: { evidence: "hasSunroof", finn: "Panoramaglasdach" },
    head_up_display: { evidence: "hasHeadUpDisplay", finn: "Head-up-Display" },
    heated_seats: { evidence: "hasHeatedSeats", finn: "Sitzheizung" },
    hitch: { evidence: "hasTowbar", finn: "Anhängerkupplung" },
    mobile_integration: { evidence: "hasAppleCarPlaySlashAndroidAuto", finn: "Apple CarPlay / Android Auto" },
};

const CARTYPES: Record<string, string> = {
    SUV: "SUVs",
    "Klein- und Kompaktwagen": "small cars",
    Kombi: "estates",
    Estate: "estates",
    Van: "vans",
    Limousine: "saloons",
    Sedan: "saloons",
    Cabriolet: "convertibles",
    Coupé: "coupés",
};

const FUELS: Record<string, string> = { Benzin: "petrol", Diesel: "diesel", Elektro: "electric", "Plug-In-Hybrid": "plug-in hybrid" };

const GEARSHIFTS: Record<string, string> = { Automatik: "automatic", Manuell: "manual" };

const OFFERS: Record<string, string> = {
    earlybooking: "early-booking offers",
    MILAGEDEAL: "mileage-package deals",
    BMWDEALS: "BMW offers",
};

const joined = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const lower = (value: string) => (/^[A-Z]{2,}|^\d/.test(value) ? value : `${value.charAt(0).toLowerCase()}${value.slice(1)}`);

/** A need that is exactly one piece of evidence the reader filtered for. */
function need(key: string, evidence: EvidenceId, label: string, said: string): Need {
    const def = EVIDENCE[evidence];

    return {
        id: needId(key),
        label,
        importance: "important",
        said,
        /* Only where the reader could have raised it themselves: expected equipment scores nothing. */
        priorities: def.raisable && def.scoredIn ? [def.scoredIn] : [],
        evidence: [{ id: evidence, use: purposeOf(evidence), unwanted: false, mustHave: false }],
        notInData: null,
        status: "active",
    };
}

/** The needs, context and figures a search stands for. */
function readSearch(search: FinnSearch, today: Date) {
    const needs: Need[] = [];
    const context: string[] = [];

    for (const feature of search.features) {
        const known = FEATURES[feature];

        if (known) needs.push(need(`feature:${feature}`, known.evidence, EVIDENCE[known.evidence].label, `“${known.finn}” ${FILTER_SAID}`));
    }

    /* FINN's seat and door filters are exact counts; the fewest chosen is the need. */
    const seats = search.seats[0];

    if (seats != null && seats >= 6) needs.push(need("seats", "seatsSixPlus", "Six or more seats", `${seats} seats ${FILTER_SAID}`));
    else if (seats === 5) needs.push(need("seats", "seatsFivePlus", "Five seats", `5 seats ${FILTER_SAID}`));
    else if (seats != null) context.push(`${joined(search.seats.map(String))} seats`);

    const doors = search.doors[0];

    if (doors != null && doors >= 4) needs.push(need("doors", "rearDoors", "Doors for the back seats", `${doors} doors ${FILTER_SAID}`));
    else if (doors != null) context.push(`${joined(search.doors.map(String))} doors`);

    if (search.gearshifts.length === 1 && search.gearshifts[0] === "Automatik") {
        needs.push(need("gearshift", "hasAutomaticTransmission", "Automatic gearbox", `Automatik ${FILTER_SAID}`));
    } else if (search.gearshifts.length) {
        context.push(`${joined(search.gearshifts.map((value) => GEARSHIFTS[value] ?? value))} gearbox`);
    }

    if (search.fuels.length === 1 && search.fuels[0] === "Elektro") {
        needs.push(need("fuel", "electricCar", "Electric", `Elektro ${FILTER_SAID}`));
    } else if (search.fuels.length) {
        context.push(`${joined(search.fuels.map((value) => FUELS[value] ?? value))} cars`);
    }

    /*
     * A body style only where Lens can read it: FINN files a car as an SUV,
     * and a small car is one Lens can measure. "Estate" or "coupé" is context:
     * nothing on the car says which it is beyond FINN's own filter.
     */
    if (search.cartypes.length === 1 && search.cartypes[0] === "SUV") {
        needs.push(need("cartype", "suvBody", "An SUV", `SUV ${FILTER_SAID}`));
    } else if (search.cartypes.length === 1 && search.cartypes[0] === "Klein- und Kompaktwagen") {
        needs.push(need("cartype", "compactLength", "A small car", `Klein- und Kompaktwagen ${FILTER_SAID}`));
    } else if (search.cartypes.length) {
        context.push(`Looking at ${joined(search.cartypes.map((value) => CARTYPES[value] ?? value))}`);
    }

    /* Brands and models apart: "BMW and 3er Limousine" reads as two brands. */
    const some = (values: string[], max = 6) =>
        values.length > max ? `${values.slice(0, max).join(", ")} and ${values.length - max} more` : joined(values);

    if (search.brands.length) context.push(`Looking at ${some(search.brands)}`);
    if (search.models.length) context.push(`Models: ${some(search.models)}`);
    if (search.productGroups.length) context.push(`Browsing ${joined(search.productGroups.map((value) => OFFERS[value] ?? value))}`);
    if (search.deals) context.push("Browsing current offers");
    if (search.colors.length) context.push(`Colours: ${joined(search.colors.slice(0, 4))}${search.colors.length > 4 ? "…" : ""}`);
    if (search.minPrice != null && search.minPrice > 0) context.push(`From ${formatEUR(search.minPrice)} a month`);
    if (search.minEvRange != null) context.push(`Electric range of at least ${search.minEvRange} km`);
    if (search.youngDriver) context.push("A driver under 23");
    if (search.business) context.push("Business prices, without VAT");
    if (search.fastAvailable) context.push("Available quickly");
    if (search.terms.length > 1) context.push(`Contracts of ${joined(search.terms.map(String))} months`);

    /* -- The period: a single contract length, and a start where one is given -- */

    const term = searchTerm(search);
    const start = searchStart(search, today);
    let rental: Understanding["rental"] = null;

    /*
     * Both halves known: the whole period, asked for nothing. With only one,
     * nothing is guessed — the chat asks for the other half alone
     * (`PeriodAsk`), because a start without an end, or a length without a
     * start, is not a period Lens can price a car on.
     */
    if (term && start && term <= MAX_RENTAL_MONTHS) {
        rental = {
            from: start.month,
            to: addMonths(start.month, term - 1),
            startDay: start.day,
            said: `a ${term}-month contract starting ${start.phrase} ${FILTER_SAID}`,
        };
    }

    return {
        needs,
        context,
        term,
        rental,
        budget:
            search.maxPrice != null && search.maxPrice > 0
                ? {
                      /*
                       * A slider's top is a figure to browse under, not a vow.
                       * FINN's price is also not everything Lens counts —
                       * mileage beyond the package and running costs come on
                       * top — so it is a target with Lens's usual headroom,
                       * not a hard maximum that would rule out the very cars
                       * the reader's own filter returned.
                       */
                      kind: "target" as const,
                      monthly: search.maxPrice,
                      stretchTo: null,
                      said: `a price of up to ${formatEUR(search.maxPrice)} a month ${FILTER_SAID}`,
                  }
                : null,
        monthlyKm:
            search.mileagePackage != null && search.mileagePackage > 0
                ? { value: search.mileagePackage, said: `the ${search.mileagePackage.toLocaleString("en-GB")} km package ${FILTER_SAID}` }
                : null,
    };
}

/**
 * The understanding with the reader's filters folded in.
 *
 * Whatever an earlier search put there is taken out first, so this is safe to
 * call every time the page's address changes: a filter the reader removed
 * stops being something Lens believes about them.
 */
export function withSearch(u: Understanding, search: FinnSearch | null, today = new Date()): Understanding {
    const own = {
        needs: u.needs.filter((item) => !item.id.startsWith(SEARCH_NEED)),
        context: u.context.filter((item) => !fromFilters(item.said)),
        budget: u.budget && !fromFilters(u.budget.said) ? u.budget : null,
        monthlyKm: u.monthlyKm && !fromFilters(u.monthlyKm.said) ? u.monthlyKm : null,
        rental: u.rental && !fromFilters(u.rental.said) ? u.rental : null,
    };

    if (!search) return { ...u, ...own };

    const read = readSearch(search, today);
    /* "No limit" or "no fixed dates", said in the chat, is an answer too; a filter doesn't overrule it. */
    const waivedBudget = u.waived.includes("budget");
    const waivedRental = u.waived.includes("rental");

    return {
        ...u,
        needs: [...own.needs, ...read.needs],
        context: [...own.context, ...read.context.map((label) => ({ label, said: FILTER_SAID }))],
        budget: own.budget ?? (waivedBudget ? null : read.budget),
        monthlyKm: own.monthlyKm ?? read.monthlyKm,
        rental: own.rental ?? (waivedRental ? null : read.rental),
    };
}

/** A single contract length the filters name, for asking only when it starts. */
export const searchTerm = (search: FinnSearch | null): number | null =>
    search?.terms.length === 1 ? search.terms[0]! : null;

/** When the reader needs the car, as FINN's availability filter says it. */
export interface SearchStart {
    /** The first month of the rental: "2026-10". */
    month: string;
    /** The day, where the filter names one — "within 14 days" does; "from November" doesn't. */
    day: number | null;
    /** For a chip: "By 7 October", "From November". */
    chip: string;
    /** For a sentence: "by 7 October", "from November". */
    phrase: string;
}

const dayMonth = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * The start the availability filter gives, or null.
 *
 * "Within 14 days" is FINN's `available_to`: the car has to be there by that
 * date, so that date is when the rental starts. "From November" is
 * `available_from`: a month, and no day. Either way the reader has already
 * said when they need the car, and being asked "from when?" after setting
 * exactly that filter is the question this exists to stop.
 */
export function searchStart(search: FinnSearch | null, today = new Date()): SearchStart | null {
    if (!search) return null;

    if (search.availableTo) {
        const date = new Date(`${search.availableTo.slice(0, 10)}T00:00:00Z`);

        if (!Number.isNaN(date.getTime()) && date.getTime() >= today.getTime() - 86_400_000) {
            const label = dayMonth(date);

            return { month: search.availableTo.slice(0, 7), day: date.getUTCDate(), chip: `By ${label}`, phrase: `by ${label}` };
        }
    }

    const from = (search.availableFrom ?? "").slice(0, 7);

    if (isMonthString(from)) {
        const day = /^\d{4}-\d{2}-\d{2}/.test(search.availableFrom ?? "") ? Number(search.availableFrom!.slice(8, 10)) : null;
        const label = day ? dayMonth(new Date(`${search.availableFrom!.slice(0, 10)}T00:00:00Z`)) : monthLabel(from);

        return { month: from, day, chip: `From ${label}`, phrase: `from ${label}` };
    }

    return null;
}

/**
 * What Lens took from the filters, for saying back: the things it will use,
 * and the things it only noted. Read off the understanding, so what the chat
 * says is exactly what Lens holds.
 */
export function heardFromSearch(u: Understanding, search: FinnSearch | null = null): { used: string[]; noted: string[] } {
    const used: string[] = [];
    const term = searchTerm(search);
    const start = searchStart(search);

    if (u.budget && fromFilters(u.budget.said)) used.push(`Around ${formatEUR(u.budget.monthly)} a month`);
    if (u.monthlyKm && fromFilters(u.monthlyKm.said)) used.push(`${u.monthlyKm.value.toLocaleString("en-GB")} km a month`);

    if (u.rental && fromFilters(u.rental.said)) {
        used.push(`${u.rental.startDay ? `${u.rental.startDay} ` : ""}${monthLabel(u.rental.from)} – ${monthLabel(u.rental.to)}`);
    } else if (!u.rental) {
        /* Half a period: used, since Lens will only ask for the other half. */
        if (start) used.push(start.chip);
        if (term) used.push(`${term}-month contract`);
    }

    for (const item of u.needs) {
        if (item.id.startsWith(SEARCH_NEED) && item.status === "active") used.push(item.label);
    }

    return { used, noted: u.context.filter((item) => fromFilters(item.said)).map((item) => item.label) };
}

/** One sentence for the start of a conversation, or nothing when there were no filters. */
export function searchSentence(u: Understanding, search: FinnSearch | null): string {
    const parts = heardFromSearch(u, search).used.map((item) =>
        /^\d+-month contract$/.test(item) ? `a ${item}` : /^(By|From) /.test(item) ? `needed ${lower(item)}` : lower(item),
    );

    if (!parts.length) return "";

    /* Dates are filled in for the reader to check, not taken as said: a filter's window isn't a day. */
    const dates = Boolean(searchStart(search) || searchTerm(search));

    return `From your filters I already know: ${joined(parts)}. ${
        dates ? "I'll fill the dates in for you to check, and won't ask about the rest again" : "I won't ask about those again"
    } — change a filter and I'll keep up.`;
}

/* -------------------------------------------------------------------------- */
/* When the filters change under a conversation                               */
/* -------------------------------------------------------------------------- */

/**
 * Which of the reader's decisions a filter change touches.
 *
 * Three things are both a filter on FINN and a question in the chat: the
 * dates (availability and contract length), the budget (the price slider) and
 * how far they drive (the mileage package). When the reader changes one of
 * those filters, whatever the chat asked about it — answered or not — is out
 * of date, and the chat has to ask again rather than carry on with an answer
 * to a question the reader has since changed.
 */
export function changedDecisions(
    before: FinnSearch | null,
    after: FinnSearch | null,
    today = new Date(),
): { period: boolean; budget: boolean; distance: boolean } {
    return {
        period:
            searchStart(before, today)?.chip !== searchStart(after, today)?.chip || searchTerm(before) !== searchTerm(after),
        budget: (before?.maxPrice ?? null) !== (after?.maxPrice ?? null),
        distance: (before?.mileagePackage ?? null) !== (after?.mileagePackage ?? null),
    };
}

/** The first day a filter's start stands for, as a date field wants it: "2026-11-01". */
export const startDate = (start: SearchStart): string => `${start.month}-${String(start.day ?? 1).padStart(2, "0")}`;

/**
 * The last day of a contract that begins on `from` ("2026-11-01") and runs for
 * `term` months, month by month the way FINN counts them: six months from
 * 1 November ends on 30 April.
 */
export function termEnd(from: string, term: number): string {
    const last = addMonths(from.slice(0, 7), term - 1);
    const [year, month] = last.split("-").map(Number);
    const day = new Date(Date.UTC(year!, month!, 0)).getUTCDate();

    return `${last}-${String(day).padStart(2, "0")}`;
}

/** A kept rental as the dates a field shows: its first day and the last day of its last month. */
export function rentalDates(rental: NonNullable<Understanding["rental"]>): { from: string; to: string } {
    const [year, month] = rental.to.split("-").map(Number);
    const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();

    return {
        from: `${rental.from}-${String(rental.startDay ?? 1).padStart(2, "0")}`,
        to: `${rental.to}-${String(last).padStart(2, "0")}`,
    };
}

/** Whether a figure came from the filters, rather than from the reader in the chat. */
export const isFromFilters = fromFilters;

/*
 * Chips that stand for one figure each: when one goes and another comes, the
 * reader changed that figure, and saying "X instead of Y" is the news.
 */
const SAME_FIGURE = [/^(By|From) /, / km a month$/, /^Around €/, /-month contract$/, / – /];

/**
 * A filter change, said once: what took the place of what, what's new, and
 * what's gone — in the chips' own words, so "Apple CarPlay / Android Auto"
 * keeps its capitals. Empty when nothing Lens uses moved.
 */
export function describeFilterChange(was: string[], now: string[]): string {
    const added = now.filter((item) => !was.includes(item));
    const removed = was.filter((item) => !now.includes(item));
    const swaps: string[] = [];

    for (const pattern of SAME_FIGURE) {
        const into = added.find((item) => pattern.test(item));
        const from = removed.find((item) => pattern.test(item));

        if (!into || !from) continue;

        added.splice(added.indexOf(into), 1);
        removed.splice(removed.indexOf(from), 1);

        /* "from 1 October instead of 1 November", not "…instead of from 1 November". */
        const [first] = into.split(" ");
        const old = from.startsWith(`${first} `) && /^(By|From|Around)$/.test(first!) ? from.slice(first!.length + 1) : lower(from);

        swaps.push(`${lower(into)} instead of ${old}`);
    }

    return [
        swaps.length ? `${swaps.join("; ")}.` : "",
        added.length ? `Now also: ${added.join(", ")}.` : "",
        removed.length ? `No longer: ${removed.join(", ")}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
}

/**
 * Whether the reader told the chat anything of their own — a need, a budget,
 * dates, a distance, something they don't care about — beyond what their
 * filters said.
 *
 * With nothing of theirs, a comparison is ranked on their saved settings
 * (with the filters): "get a match from my Lens settings". That is what it
 * has to be called wherever it is shown, or a settings ranking passes for the
 * chat having understood them.
 */
export function readerSaidAnything(u: Understanding): boolean {
    const own = (said: string | null | undefined) => Boolean(said) && !fromFilters(said);

    return (
        u.needs.some((need) => need.status === "active" && !need.id.startsWith(SEARCH_NEED)) ||
        own(u.budget?.said) ||
        own(u.rental?.said) ||
        own(u.monthlyKm?.said) ||
        u.context.some((item) => own(item.said)) ||
        u.droppedPriorities.length > 0 ||
        u.notModelled.length > 0 ||
        u.waived.length > 0
    );
}
