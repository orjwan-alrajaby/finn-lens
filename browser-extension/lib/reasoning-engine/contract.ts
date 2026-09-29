import type { ContractTerm, PinnedFinnCar } from "@/lib/types";
import type { LensPreferences } from "./types";

/**
 * Whether a car can be rented for the period the reader wants, and on which
 * FINN term.
 *
 * FINN sells fixed terms — 6, 12, 18, 24 months — not arbitrary dates, and
 * its data doesn't say whether a contract can be extended or ended early. So
 * a period is answered the only way the data supports:
 *
 * - **The term** is the shortest one on offer that covers the whole period.
 *   October to May is eight months; on a car offering 6 and 12 that is the
 *   12-month term, priced as such, with the four months it commits the reader
 *   past May said out loud. A car whose longest term is shorter than the
 *   period doesn't cover it.
 * - **Delivery** is checked against that term's own window, because FINN's
 *   windows differ by term. The car has to be deliverable in the start month.
 *
 * Like the budget, this is three-state and decides eligibility only — it
 * never adds or removes a point. `unknown` is never read as fitting.
 */

/** "2026-10" — a calendar month, which is as precise as a rental plan needs. */
export type MonthString = string;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonthString(value: unknown): value is MonthString {
    return typeof value === "string" && MONTH.test(value);
}

/** Months from the start of `from` to the end of `to`, both included. */
export function monthsInclusive(from: MonthString, to: MonthString): number {
    const [fy, fm] = from.split("-").map(Number) as [number, number];
    const [ty, tm] = to.split("-").map(Number) as [number, number];

    return (ty - fy) * 12 + (tm - fm) + 1;
}

/** The longest period Lens accepts. FINN's longest term today is 24 months, so a longer one simply fits no car. */
export const MAX_RENTAL_MONTHS = 48;

export interface RentalPeriod {
    from: MonthString;
    to: MonthString;
    months: number;
}

/** The reader's period, or null when none is set or it doesn't make sense. */
export function rentalPeriodOf(preferences: LensPreferences): RentalPeriod | null {
    const { rentalFrom, rentalTo } = preferences;

    if (!isMonthString(rentalFrom) || !isMonthString(rentalTo)) return null;

    const months = monthsInclusive(rentalFrom, rentalTo);

    return months >= 1 && months <= MAX_RENTAL_MONTHS
        ? { from: rentalFrom, to: rentalTo, months }
        : null;
}

/** Month `offset` months after `month`: ("2026-10", 12) → "2027-10". */
export function addMonths(month: MonthString, offset: number): MonthString {
    const [year, index] = month.split("-").map(Number) as [number, number];
    const total = year * 12 + (index - 1) + offset;

    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export type RentalStatus = "notSet" | "fits" | "doesNotFit" | "unknown";

export type RentalProblem =
    /** FINN's data for this car carries no terms — typically a car pinned before Lens read them. */
    | "noContractData"
    /** The longest term on offer is shorter than the period. */
    | "noTermCovers"
    /** The earliest delivery FINN lists is after the start month. */
    | "deliveredTooLate"
    /** FINN's current listing stops taking deliveries before the start month. */
    | "notBookableYet"
    /** The earliest delivery is in the start month, but its stated slip could push it past. */
    | "mayArriveLate"
    /** FINN gave no delivery window for the term. */
    | "noDeliveryWindow";

export interface ContractFit {
    period: RentalPeriod | null;
    status: RentalStatus;
    /** The term Lens priced this car on, or null when FINN's terms aren't known. */
    term: ContractTerm | null;
    /** Months the term runs past the end of the period. Null without a period. */
    extraMonths: number | null;
    /** Every term length on offer, shortest first. */
    termsOffered: number[];
    problems: RentalProblem[];
}

/**
 * The term a car is priced on and whether it fits the reader's period.
 *
 * Without a period the term is FINN's own default, so prices match the ones
 * FINN shows first, and the status is `notSet`.
 */
export function fitContract(
    vehicle: Pick<PinnedFinnCar, "contract">,
    preferences: LensPreferences,
): ContractFit {
    const period = rentalPeriodOf(preferences);
    const terms = vehicle.contract?.terms ?? [];
    const termsOffered = terms.map((term) => term.months);

    if (!terms.length) {
        return {
            period,
            status: period ? "unknown" : "notSet",
            term: null,
            extraMonths: null,
            termsOffered,
            problems: period ? ["noContractData"] : [],
        };
    }

    if (!period) {
        const term =
            terms.find((item) => item.months === vehicle.contract?.defaultMonths) ??
            terms[0]!;

        return { period, status: "notSet", term, extraMonths: null, termsOffered, problems: [] };
    }

    const covering = terms.find((item) => item.months >= period.months);
    const term = covering ?? terms[terms.length - 1]!;
    const problems: RentalProblem[] = [];

    if (!covering) problems.push("noTermCovers");

    const startFirst = `${period.from}-01`;
    const startLast = `${addMonths(period.from, 1)}-01`; // exclusive

    if (!term.deliveryFrom && !term.deliveryTo) {
        problems.push("noDeliveryWindow");
    } else if (term.deliveryFrom && term.deliveryFrom >= startLast) {
        problems.push("deliveredTooLate");
    } else if (term.deliveryTo && term.deliveryTo < startFirst) {
        problems.push("notBookableYet");
    } else if (
        term.deliveryFrom &&
        term.deviationWeeks &&
        term.deliveryFrom >= startFirst &&
        addDays(term.deliveryFrom, term.deviationWeeks * 7) >= startLast
    ) {
        problems.push("mayArriveLate");
    }

    const fails = problems.some((problem) => problem === "noTermCovers" || problem === "deliveredTooLate");

    return {
        period,
        status: fails ? "doesNotFit" : problems.length ? "unknown" : "fits",
        term,
        extraMonths: covering ? covering.months - period.months : null,
        termsOffered,
        problems,
    };
}

function addDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
}

/** How strongly the rental period rules a car out: lower is better. */
export function rentalTier(status: RentalStatus): number {
    return status === "doesNotFit" ? 2 : status === "unknown" ? 1 : 0;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/** "2026-10" → "October 2026". */
export function monthLabel(month: MonthString): string {
    const [year, index] = month.split("-").map(Number) as [number, number];

    return `${MONTH_NAMES[index - 1]} ${year}`;
}

/** "October 2026 to May 2027". */
export function periodLabel(period: RentalPeriod): string {
    return `${monthLabel(period.from)} to ${monthLabel(period.to)}`;
}

/** "5 Oct 2026". */
export function dayLabel(isoDate: string): string {
    const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];

    return `${day} ${MONTH_NAMES[month - 1]!.slice(0, 3)} ${year}`;
}

/**
 * Why a car doesn't fit, or can't be confirmed to, in one clause that reads
 * after the car's name: "only offers terms up to 6 months".
 */
export function describeRentalProblem(fit: ContractFit): string | null {
    const [problem] = fit.problems;
    const period = fit.period;

    if (!problem || !period) return null;

    switch (problem) {
        case "noContractData":
            return "has no FINN contract terms in Lens's copy of its data — open it on FINN again to refresh them";
        case "noTermCovers":
            return `only offers terms up to ${Math.max(...fit.termsOffered)} months, which doesn't cover ${periodLabel(period)}`;
        case "deliveredTooLate":
            return `can't be delivered before ${dayLabel(fit.term!.deliveryFrom!)}, after your ${monthLabel(period.from)} start`;
        case "notBookableYet":
            return `is only listed for delivery until ${dayLabel(fit.term!.deliveryTo!)}, so FINN can't yet confirm a ${monthLabel(period.from)} start`;
        case "mayArriveLate":
            return `is due ${dayLabel(fit.term!.deliveryFrom!)}, but FINN says that can slip by up to ${fit.term!.deviationWeeks} weeks, past the end of ${monthLabel(period.from)}`;
        case "noDeliveryWindow":
            return "has no delivery dates in FINN's data";
    }
}
