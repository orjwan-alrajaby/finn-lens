import type { CategoryId } from "@/lib/reasoning-engine/types";
import type { FinnCar } from "@/lib/types";

import { barePhrase, coverage, EVIDENCE, type EvidenceId } from "./evidence";
import { applyChoices, explain, guideSteps } from "./guide";
import type { Need, Rule, Understanding } from "./understanding";

/**
 * Deal-breakers and deal-sealers: the few things that decide a car for the
 * reader either way.
 *
 * A deal-breaker sets cars aside before anything is scored — "must be
 * electric", "mustn't be an SUV" — and is one of the guide's rules, so it
 * works exactly as the rules always have. A deal-sealer counts as much as
 * anything can, a must have, without setting any car aside: a car without
 * it can still win, if it's better at everything else. Each row offers only
 * what Lens can do with it: no "electric seals it", since being electric
 * isn't something Lens scores, only something it can rule on.
 */

export type DealState = "must" | "mustNot" | "seal";

export interface Deal {
    id: string;
    label: string;
    /** A kind of car — "must be", not "must have". */
    kind: boolean;
    /** In a sentence: "It must have an automatic gearbox." */
    phrase: string;
    group: "money" | "energy" | "car";
    /** Behind its "i". */
    description: string;
    /** A row that can't be a hard line beside this one: "Electric" and "Not electric". */
    rival?: string;
    /** The car fact its rule is about: what a "must" or "mustn't" checks. */
    rule?: EvidenceId;
    /** The rule a "must" sets, by the rules question's id. */
    must?: string;
    /** The rule a "mustn't" sets. */
    mustNot?: string;
    /** What sealing it counts: a piece of equipment, or a figure. */
    seal?: { evidence?: EvidenceId; figure?: CategoryId; need: string };
}

export const DEALS: Deal[] = [
    {
        id: "limit",
        phrase: "over my limit",
        label: "Within my limit",
        kind: true,
        group: "money",
        mustNot: "firm-budget",
        description: "Nothing over your monthly limit, all costs together: cars over it are set aside rather than ranked lower.",
    },
    {
        id: "electric",
        rule: "electricCar",
        phrase: "electric",
        label: "Electric",
        kind: true,
        group: "energy",
        must: "electric-only",
        rival: "not-electric",
        description: "Only electric cars: 0 g/km of CO₂ on the road.",
    },
    {
        id: "not-electric",
        rule: "electricCar",
        phrase: "electric",
        label: "Not electric",
        kind: true,
        group: "energy",
        mustNot: "not-electric",
        rival: "electric",
        description: "Petrol, diesel or hybrid only — no fully electric cars.",
    },
    {
        id: "co2",
        rule: "lowCo2",
        phrase: "low CO₂ (class A–C)",
        label: "Low CO₂ (class A–C)",
        kind: true,
        group: "energy",
        must: "low-co2",
        seal: { figure: "environmental", need: "Low CO₂" },
        description: "Class A to C on the German CO₂ label: 115 g/km or less. Every electric car is class A.",
    },
    {
        id: "frugal",
        rule: "frugal",
        phrase: "frugal for its kind",
        label: "Frugal for its kind",
        kind: true,
        group: "energy",
        must: "frugal",
        seal: { figure: "efficiency", need: "Using little fuel or electricity" },
        description: "Uses noticeably less fuel or electricity than others that run on the same thing. A plug-in hybrid can't be judged on it.",
    },
    {
        id: "automatic",
        rule: "hasAutomaticTransmission",
        phrase: "an automatic gearbox",
        label: "Automatic gearbox",
        kind: false,
        group: "car",
        must: "automatic",
        seal: { evidence: "hasAutomaticTransmission", need: "An automatic gearbox" },
        description: "No clutch pedal and no gear changes.",
    },
    {
        id: "suv",
        rule: "suvBody",
        phrase: "an SUV",
        label: "Not an SUV",
        kind: true,
        group: "car",
        mustNot: "no-suv",
        description: "No SUVs — the taller, boxier body FINN lists as one.",
    },
    {
        id: "doors",
        rule: "rearDoors",
        phrase: "rear doors",
        label: "Rear doors",
        kind: false,
        group: "car",
        must: "four-doors",
        seal: { evidence: "rearDoors", need: "Rear doors" },
        description: "Doors for the back seats, from the number of doors FINN lists.",
    },
    {
        id: "seats",
        rule: "seatsSixPlus",
        phrase: "six or more seats",
        label: "Six or more seats",
        kind: false,
        group: "car",
        must: "six-seats",
        seal: { evidence: "seatsSixPlus", need: "Six or more seats" },
        description: "Room for more than five people, usually with a third row.",
    },
    {
        id: "towbar",
        rule: "hasTowbar",
        phrase: "a towbar",
        label: "Towbar",
        kind: false,
        group: "car",
        must: "must-tow",
        seal: { evidence: "hasTowbar", need: "A towbar" },
        description: "A fitted hitch, for a trailer, a caravan or a bike rack.",
    },
    {
        id: "awd",
        rule: "hasAllWheelDrive",
        phrase: "all-wheel drive",
        label: "All-wheel drive",
        kind: false,
        group: "car",
        must: "awd",
        seal: { evidence: "hasAllWheelDrive", need: "All-wheel drive" },
        description: "Power to all four wheels: grip pulling away on snow and ice. It doesn't shorten braking.",
    },
];

/** The deal a rules-question id belongs to, for suggestions made in rules' terms. */
export const dealForRule = (rule: string): Deal | undefined => DEALS.find((deal) => deal.must === rule || deal.mustNot === rule);

/**
 * How hard a line the reader draws, as the row offers it: Flexible — a
 * deal-sealer, counted as a top priority — or Hard line — a deal-breaker,
 * cars without it set aside.
 */
export const HARDNESS: Record<DealState, { label: string; means: string }> = {
    seal: { label: "Flexible", means: "A deal-sealer: counts as a top priority, but a car without it can still win if it's clearly better at everything else." },
    must: { label: "Hard line", means: "A deal-breaker: any car without it is set aside before I score anything." },
    mustNot: { label: "Hard line", means: "A deal-breaker: any car that is one is set aside before I score anything." },
};

/** How a state reads in a sentence: "Must be", "Mustn't have", "Seals it". */
export const stateLabel = (deal: Pick<Deal, "kind">, state: DealState): string =>
    state === "seal" ? "Seals it" : state === "must" ? (deal.kind ? "Must be" : "Must have") : deal.kind ? "Mustn't be" : "Mustn't have";

/**
 * What each row can do here: a rule only where it would keep some cars and
 * set some aside, sealing only where the cars here differ on it (or it's a
 * figure every car has). "Over my limit" needs a limit, and not one the
 * budget bubble already said how firm it is.
 */
export function dealsHere(u: Understanding, cars: FinnCar[]): { deal: Deal; options: DealState[] }[] {
    const rules = new Set((guideSteps(cars).find((step) => step.id === "rules")?.choices ?? []).map((choice) => choice.id));
    const ruleHere = (id?: string) => Boolean(id) && (id === "firm-budget" ? Boolean(u.budget) && !u.bubbles?.budget?.chips.length : rules.has(id!));
    const sealHere = (deal: Deal) => {
        if (!deal.seal) return false;
        if (deal.seal.figure || !cars.length) return true;

        const { listed, notListed, unknown } = coverage(cars, deal.seal.evidence!);
        return listed > 0 && notListed + unknown > 0;
    };

    return DEALS.map((deal) => ({
        deal,
        /* Softest first: Flexible, then the hard line. */
        options: [sealHere(deal) ? ("seal" as const) : null, ruleHere(deal.must) ? ("must" as const) : null, ruleHere(deal.mustNot) ? ("mustNot" as const) : null].filter(
            (state): state is DealState => state != null,
        ),
    })).filter((row) => row.options.length > 0);
}

/** How each deal stands now: the rules the reader set, and what they said would seal it. */
export function dealStates(u: Understanding): Record<string, DealState> {
    const active = new Set(u.needs.filter((need) => need.status === "active").map((need) => need.id));
    const states: Record<string, DealState> = {};

    for (const deal of DEALS) {
        if (deal.must && active.has(`rules-${deal.must}`)) states[deal.id] = "must";
        else if (deal.mustNot === "firm-budget" ? u.budget?.firm : deal.mustNot && active.has(`rules-${deal.mustNot}`)) states[deal.id] = "mustNot";
        else if (active.has(`sealer-${deal.id}`)) states[deal.id] = "seal";
    }

    return states;
}

/** The need a deal-sealer stands for: a must have, counting what it names and nothing else. */
function sealerNeed(deal: Deal): Need {
    const { evidence, figure, need } = deal.seal!;

    return {
        id: `sealer-${deal.id}`,
        label: need,
        importance: "essential",
        said: `${deal.label} would seal it.`,
        priorities: figure ? [figure] : [EVIDENCE[evidence!].scoredIn!],
        evidence: evidence ? [{ id: evidence, use: explain(evidence), unwanted: false, mustHave: false }] : [],
        notInData: null,
        status: "active",
    };
}

/**
 * The reader's deal-breakers and deal-sealers, for the rows they were
 * offered: rules for each "must" and "mustn't", a must-have need for each
 * seal, and "Over my limit" on the budget itself. Anything about a row they
 * weren't offered — a rule only words reached, say — is left as it was.
 */
export function withDeals(u: Understanding, offered: string[], states: Record<string, DealState | undefined>): Understanding {
    const deals = DEALS.filter((deal) => offered.includes(deal.id));
    const ruleIds = new Set(deals.flatMap((deal) => [deal.must, deal.mustNot]).filter((id): id is string => Boolean(id) && id !== "firm-budget"));
    const step = guideSteps([]).find((item) => item.id === "rules")!;
    const picked = deals.map((deal) => (states[deal.id] === "must" ? deal.must : states[deal.id] === "mustNot" ? deal.mustNot : undefined)).filter((id): id is string => Boolean(id) && id !== "firm-budget");

    let next = applyChoices(u, { ...step, choices: step.choices.filter((choice) => ruleIds.has(choice.id)) }, picked);

    if (deals.some((deal) => deal.id === "limit") && next.budget) {
        const firm = states.limit === "mustNot";
        next = { ...next, budget: { ...next.budget, firm, kind: firm ? "hardMax" : next.budget.kind } };
    }

    const sealed = deals.filter((deal) => states[deal.id] === "seal" && deal.seal).map(sealerNeed);
    const mine = new Set(deals.map((deal) => `sealer-${deal.id}`));

    return { ...next, needs: [...next.needs.filter((need) => !mine.has(need.id)), ...sealed] };
}

/** A rule as the deal-breakers question words it: "Must have all-wheel drive", "Mustn't be an SUV". */
export function demandOf(rule: Pick<Rule, "id" | "mode">): string {
    const state: DealState = rule.mode === "must" ? "must" : "mustNot";
    const deal = DEALS.find((item) => item.rule === rule.id && (state === "must" ? item.must : item.mustNot));

    return deal ? `${stateLabel(deal, state)} ${deal.phrase}` : `${rule.mode === "must" ? "Must have" : "Mustn't have"} ${barePhrase(rule.id)}`;
}

/**
 * Deal-breakers let go of, when no car has them all: each becomes a
 * deal-sealer where Lens can score it — it still counts as much as anything
 * can, it just doesn't set cars aside — and is simply no longer a rule
 * where it can't ("must be electric" is ruled on, never scored). A rule
 * that came from the reader's own words, with no row of its own, stops
 * being one too.
 */
export function letGo(u: Understanding, rules: EvidenceId[]): Understanding {
    let next = u;

    for (const id of rules) {
        /* Every row about it — "Electric" and "Not electric" — so no rule of either kind is left behind. */
        for (const deal of DEALS.filter((item) => item.rule === id)) next = withDeals(next, [deal.id], { [deal.id]: deal.seal ? "seal" : undefined });

        next = {
            ...next,
            needs: next.needs.map((need) => ({
                ...need,
                evidence: need.evidence.map((entry) => (entry.id === id && (entry.mustHave || entry.unwanted) ? { ...entry, mustHave: false, unwanted: false } : entry)),
            })),
        };
    }

    return next;
}
