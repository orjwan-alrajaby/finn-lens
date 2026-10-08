import { EFFICIENCY_BAND_WORDS } from "@/lib/reasoning-engine/environmental";
import type { CategoryId } from "@/lib/reasoning-engine/types";
import { SOURCES, type Source } from "@/lib/sources";
import type { FinnCar } from "@/lib/types";

import { assessEnvironment, efficiencyScore } from "@/lib/reasoning-engine/environmental";

import { barePhrase, coverage, EVIDENCE, NEARLY_EVERY, setsApart, type EvidenceId } from "./evidence";
import { allowedByRules } from "./run";
import { applyChoices, explain, guideSteps } from "./guide";
import { figureReasons } from "./bubbles";
import { ruledOut, type Need, type Rule, type Understanding } from "./understanding";

/** The fuels, as "What can it run on?" rules on them. */
const FUEL_RULES = new Set<EvidenceId>(["electricCar", "petrolCar", "dieselCar", "plugInHybrid"]);

/**
 * Whether the cars differ on a figure, so sealing it could move anything:
 * their CO₂, or their use for their kind. Every car here at 0 g/km — a page of
 * electric cars — can't be told apart on CO₂, however much it counts.
 */
function figureDiffers(cars: FinnCar[], figure: CategoryId): boolean {
    const values = cars
        .map((car) => (figure === "environmental" ? assessEnvironment(car)?.co2?.gPerKm : figure === "efficiency" ? efficiencyScore(car)?.score : undefined))
        .filter((value): value is number => value != null);

    return new Set(values).size > 1;
}

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

/* "flex": the dates, a month either way — a rule, on dates moved a month if they must be. */
export type DealState = "must" | "mustNot" | "seal" | "flex";

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
    sources?: Source[];
    /** The car fact its rule is about: what a "must" or "mustn't" checks. */
    rule?: EvidenceId;
    /** The rule a "must" sets, by the rules question's id. */
    must?: string;
    /** The rule a "mustn't" sets. */
    mustNot?: string;
    /**
     * What sealing it counts: a piece of equipment, or a figure. For a
     * figure, what a bubble weighing it already does ("lower CO₂ counts"),
     * and who a "must" sets aside ("every car above class C") — said on the
     * row in place of "Seals it", so it asks only what the bubble didn't.
     */
    seal?: { evidence?: EvidenceId; figure?: CategoryId; need: string; counts?: string; aside?: string };
    /** Its own words for its options, where "Must have" doesn't fit: "My dates only". */
    labels?: Partial<Record<DealState, string>>;
}

export const DEALS: Deal[] = [
    {
        id: "limit",
        phrase: "over my limit",
        label: "Over my limit",
        kind: true,
        group: "money",
        mustNot: "firm-budget",
        description: "Cars over your monthly limit, all costs together, are set aside rather than ranked lower.",
    },
    {
        /*
         * The dates, as a rule. Not a car fact: FINN's terms and delivery
         * windows for the reader's period (contract.ts). Offered once there
         * are dates, as "my dates only" or "a month either way".
         */
        id: "dates",
        phrase: "available for my dates",
        label: "Available for my dates",
        kind: false,
        group: "money",
        labels: { must: "My dates only", flex: "A month either way" },
        description: "Whether FINN can rent the car for your dates: a term that covers them, and delivery by the month you start.",
    },
    {
        id: "electric",
        rule: "electricCar",
        phrase: "electric",
        label: "Electric",
        kind: true,
        group: "energy",
        must: "electric-only",
        mustNot: "not-electric",
        description: "Only electric cars, or none of them.",
    },
    {
        id: "co2",
        rule: "lowCo2",
        phrase: "low CO₂ emissions",
        label: "Low CO₂ emissions",
        /* "Must have low CO₂ emissions": had, not been. */
        kind: false,
        group: "energy",
        must: "low-co2",
        seal: { figure: "environmental", need: "Low CO₂ emissions", counts: "lower CO₂ already ranks higher", aside: "every car above class C" },
        description: "Class A to C on the German CO₂ label: 115 g/km or less. Every electric car is class A.",
        sources: [SOURCES.co2Label],
    },
    {
        id: "frugal",
        rule: "frugal",
        phrase: "frugal for its kind",
        label: "Frugal for its kind",
        kind: true,
        /* Money first: using less is cheaper to run, before it's anything else. */
        group: "money",
        must: "frugal",
        seal: { figure: "efficiency", need: "Using little fuel or electricity", counts: "using less for its kind already ranks higher", aside: "every car that isn't" },
        description: `Cheaper to run than cars on the same fuel, since it uses less of it — and for petrol and diesel, less CO₂ too. That's fuel or electricity use ${EFFICIENCY_BAND_WORDS} or more below FINN Lens's benchmark for cars that run on the same thing. A plug-in hybrid can't be judged on it.`,
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
        label: "SUV",
        kind: true,
        group: "car",
        /* Wanted or not, either way a rule: Lens reads body type, it doesn't score it. */
        must: "suv-only",
        mustNot: "no-suv",
        description: "Cars FINN files as SUVs: FINN's body type, not a measurement.",
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
        description: "Room for more than five people, from the seat count FINN lists.",
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
        description:
            "Power to all four wheels, with more grip pulling away and accelerating on snow. However, no help braking in the cold or on snow, and no substitute for winter tyres.",
        sources: [SOURCES.adacAwd],
    },
];

/** The deal a rules-question id belongs to, for suggestions made in rules' terms. */
export const dealForRule = (rule: string): Deal | undefined => DEALS.find((deal) => deal.must === rule || deal.mustNot === rule);

/** What each option on a row means to Lens, on hover. */
export const DEAL_MEANS: Record<DealState, string> = {
    must: "A deal-breaker: any car without it is set aside before I score anything.",
    mustNot: "A deal-breaker: any car that is one is set aside before I score anything.",
    seal: "A deal-sealer: counts as a top priority, but a car without it can still win if it's clearly better at everything else.",
    flex: "Still a deal-breaker, but a car also counts if it can be rented with the start a month earlier or later — and it says which.",
};

/** How a state reads on the row: "Must be", "Mustn't have", "Seals it". */
export const stateLabel = (deal: Pick<Deal, "kind">, state: DealState): string =>
    state === "seal" ? "Seals it" : state === "must" ? (deal.kind ? "Must be" : "Must have") : deal.kind ? "Mustn't be" : "Mustn't have";

/**
 * What each row can do here: a rule only where it would keep some cars and
 * set some aside, sealing only where the cars here differ on it — on some,
 * not nearly all — or, for a figure, where they differ on that. "Over my
 * limit" needs a limit, and not one the budget bubble already said how firm
 * it is.
 */
export function dealsHere(u: Understanding, cars: FinnCar[]): { deal: Deal; options: DealState[]; note?: string }[] {
    const rules = new Set((guideSteps(cars).find((step) => step.id === "rules")?.choices ?? []).map((choice) => choice.id));
    const ruleHere = (id?: string) => Boolean(id) && (id === "firm-budget" ? Boolean(u.budget) && !u.bubbles?.budget?.chips.length : rules.has(id!));
    /* The cars what it can run on leaves in, since that's asked first: a figure is judged among them. */
    const fuelled = allowedByRules(cars, ruledOut(u).filter((rule) => FUEL_RULES.has(rule.id)));
    const set = dealStates(u);
    /* The figures a bubble already weighs: sealing one would count it twice, under two names. */
    const weighed = figureReasons(u);
    const sealHere = (deal: Deal) => {
        if (!deal.seal) return false;
        /* Sealed already, so it can be undone. */
        if (set[deal.id] === "seal") return true;
        if (deal.seal.figure && weighed.has(deal.seal.figure)) return false;
        if (!cars.length) return true;
        if (deal.seal.figure) return figureDiffers(fuelled, deal.seal.figure);

        /* Sealing on what nearly every car here has can't tell them apart: the gearbox's row stays, without it. */
        return setsApart(cars, deal.seal.evidence!);
    };
    /* Why a row that could seal the deal elsewhere can't here: said from the cars, so the missing "Seals it" isn't a puzzle. */
    const noSeal = (deal: Deal): string =>
        !deal.seal
            ? "I can only rule on this, not weigh it — so it can't seal the deal."
            : deal.seal.figure && weighed.has(deal.seal.figure)
              ? `${weighed.get(deal.seal.figure)!.replace(/^./, (c) => c.toUpperCase())}, so ${deal.seal.counts}. “${stateLabel(deal, "must")}” sets aside ${deal.seal.aside}.`
              : deal.seal.figure
              ? "The cars here don't differ on it, so it can't seal the deal."
              : coverage(cars, deal.seal.evidence!).listed === 0
                ? "None of the cars here list it, so it can't seal the deal."
                : "Nearly every car here has it, so it can't seal the deal.";

    /*
     * Something nearly every car here has — rear doors on 641 of FINN's 698 —
     * is no decision worth a row: ruling on it sets aside a handful, and
     * sealing it can't tell the cars apart. Hidden, unless the reader has
     * set it already (so they can undo it), or it's the gearbox: someone
     * whose licence is automatic-only can't take a manual at all, however
     * few there are. Judged among the cars what it runs on leaves: low CO₂
     * beside electric only is every car left. A row with both sides — an
     * SUV, or not — is a choice whichever way most cars here go.
     */
    const nearlyEvery = (deal: Deal) => {
        if (!fuelled.length || !deal.rule || deal.id === "automatic" || set[deal.id] || (deal.must && deal.mustNot)) return false;

        const { listed, notListed, total } = coverage(fuelled, deal.rule);
        /* What a "must" keeps, or a "mustn't" sets aside: nearly all of them either way. */
        return (deal.mustNot ? notListed : listed) / total >= NEARLY_EVERY;
    };
    /* Why a row's "Must have" isn't there: none of the cars here would be left. */
    const noMust = (deal: Deal): string | null =>
        deal.must && deal.rule && coverage(cars, deal.rule).listed === 0
            ? `None of the cars here ${deal.kind ? "is" : "has"} ${deal.phrase}, so “${stateLabel(deal, "must")}” would set every car aside.`
            : null;

    /* Electric or not is asked on its own now — "What can it run on?" — so it isn't a row here too. */
    return DEALS.filter((deal) => deal.id !== "electric" && !nearlyEvery(deal))
        .map((deal) => {
            const options =
                deal.id === "dates"
                    ? u.rental
                        ? (["must", "flex"] as DealState[])
                        : []
                    : ([ruleHere(deal.must) ? "must" : null, ruleHere(deal.mustNot) ? "mustNot" : null, sealHere(deal) ? "seal" : null] as (DealState | null)[]).filter(
                          (state): state is DealState => state != null,
                      );

            const notes = [
                deal.must && !options.includes("must") ? noMust(deal) : null,
                options.length && !options.includes("seal") ? noSeal(deal) : null,
            ].filter((note): note is string => Boolean(note));

            return { deal, options, ...(notes.length ? { note: notes.join(" ") } : {}) };
        })
        .filter((row) => row.options.length > 0);
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

    if (u.rental?.firm) states.dates = (u.rental.flexMonths ?? 0) > 0 ? "flex" : "must";

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

    /* The dates: a rule held on the rental itself — exact, or a month either way. */
    if (deals.some((deal) => deal.id === "dates") && next.rental) {
        const state = states.dates;
        next = { ...next, rental: { ...next.rental, firm: state === "must" || state === "flex", flexMonths: state === "flex" ? 1 : 0 } };
    }

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
    const deal = DEALS.find((item) => item.rule === rule.id);
    const state: DealState = rule.mode === "must" ? "must" : "mustNot";

    if (deal) return `${stateLabel(deal, state)} ${deal.phrase}`;
    /* A fuel set aside, from "What can it run on?": "Not petrol". */
    if (rule.mode === "without" && EVIDENCE[rule.id].negativeLabel) return EVIDENCE[rule.id].negativeLabel!;
    return `${rule.mode === "must" ? "Must have" : "Mustn't have"} ${barePhrase(rule.id)}`;
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
        const deal = DEALS.find((item) => item.rule === id);
        if (deal) next = withDeals(next, [deal.id], { [deal.id]: deal.seal ? "seal" : undefined });

        next = {
            ...next,
            needs: next.needs
                .map((need) => ({
                    ...need,
                    /* A fuel let go of is simply allowed again: what it runs on counts nothing, so it's dropped, not kept as a want. */
                    evidence:
                        need.id === "fuel"
                            ? need.evidence.filter((entry) => entry.id !== id)
                            : need.evidence.map((entry) => (entry.id === id && (entry.mustHave || entry.unwanted) ? { ...entry, mustHave: false, unwanted: false } : entry)),
                }))
                .filter((need) => need.id !== "fuel" || need.evidence.length > 0),
        };
    }

    return next;
}
