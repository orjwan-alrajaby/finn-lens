import {
    CATEGORIES,
    CATEGORY_IDS,
    FEATURE_IMPORTANCE,
    FINN_INCLUDED_MONTHLY_KM,
    MAX_FEATURES_PER_CATEGORY,
    MAX_PRIORITIES,
    MIN_PRIORITIES,
} from "@/lib/reasoning-engine/constants";
import { isMonthString, MAX_RENTAL_MONTHS, monthsInclusive } from "@/lib/reasoning-engine/contract";
import { priorityWeights } from "@/lib/reasoning-engine";
import type { CategoryId, FeatureImportance, SignalId } from "@/lib/reasoning-engine/types";
import type {
    NeedImportance,
    WireQuestion,
    WireUnderstanding,
} from "@/lib/lens-ai/contract";

import type { Answers } from "@/lib/reasoning-engine/answers";
import type { FinnCar } from "@/lib/types";

import { AMBIGUOUS_FIGURES, coverage, EVIDENCE, isEvidenceId, withoutLabel, type EvidenceId } from "./evidence";

/** A quantity in a use clause: "four seats", "2 USB ports". */
const COUNTS = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;

/** A message that says anything about money: a figure, a currency, or the words for it. */
const MONEY = /\d|€|\beur(o|os)?\b|budget|spend|afford|pay\b|paying|cost|price|cheap|expensive|money|\bmax(imum)?\b|limit|stretch|a month\b|monthly/i;

/** Evidence on at least this share of the cars in scope can't tell them apart. */
const UNIVERSAL_SHARE = 0.9;

/** A question's answer has to turn on evidence no more common than this. */
const QUESTION_SPLIT = 0.85;

/**
 * A person's situation, as Lens can use it.
 *
 * The model reads what someone says into needs, constraints, context,
 * capabilities and open questions. This file is the other half: it checks
 * every part of that against what Lens really has — its priorities, the
 * evidence it can read on a car — keeps what the conversation already
 * established when a turn leaves it out, and turns the result into the
 * ordinary `Answers` the engine ranks cars with. The engine never sees a
 * need; it sees an order, raised features, a budget and a rental period.
 */

export interface Need {
    id: string;
    label: string;
    importance: NeedImportance;
    said: string;
    priorities: CategoryId[];
    evidence: { id: EvidenceId; use: string; unwanted: boolean; mustHave: boolean }[];
    notInData: string | null;
    status: "active" | "dropped";
}

export interface Understanding {
    budget: { kind: "hardMax" | "target"; monthly: number; stretchTo: number | null; said: string } | null;
    rental: { from: string; to: string; startDay: number | null; said: string } | null;
    monthlyKm: { value: number; said: string } | null;
    needs: Need[];
    context: { label: string; said: string }[];
    capabilities: { label: string; said: string; lessRelevant: EvidenceId[] }[];
    droppedPriorities: CategoryId[];
    /** Evidence Lens offered and the reader turned down. Never raised again. */
    declined: EvidenceId[];
    /** Where the choice will really be made, in the reader's terms. */
    tension: string;
    /**
     * Things the reader raised that Lens can't score. "wants" is a gap Lens
     * has to admit; "doesntCare" is a preference worth showing back to them —
     * they said it, and seeing it listed is how they know it was heard.
     */
    notModelled: { said: string; stance: "wants" | "doesntCare"; explanation: string }[];
    /**
     * Essentials the reader was asked for and chose not to give. Lens waits
     * for an answer before it compares, and "no limit" is an answer — without
     * this it looks exactly like silence, and the question comes back forever.
     */
    waived: ("budget" | "rental")[];
    /**
     * How many people usually ride with the driver: 0 for "just me", null
     * until asked. It decides who is asked about next. Chats saved before
     * Lens asked come back without it.
     */
    passengers?: number | null;
}

export const EMPTY_UNDERSTANDING: Understanding = {
    budget: null,
    rental: null,
    monthlyKm: null,
    needs: [],
    context: [],
    capabilities: [],
    droppedPriorities: [],
    declined: [],
    tension: "",
    notModelled: [],
    waived: [],
    passengers: null,
};

export const isEmptyUnderstanding = (u: Understanding): boolean =>
    !u.budget && !u.rental && !u.monthlyKm && !u.needs.some((need) => need.status === "active") && !u.droppedPriorities.length;

/* -------------------------------------------------------------------------- */
/* Checking what the model said                                               */
/* -------------------------------------------------------------------------- */

const text = (value: unknown, max: number): string =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const IMPORTANCE: NeedImportance[] = ["essential", "important", "niceToHave"];

const slug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/**
 * Where a need's evidence pulls its priority in — but only evidence a reader
 * could raise there. Equipment every car in a priority is expected to have
 * (air conditioning under climate) says nothing about what the person ranked:
 * counting it turned "not annoying to live with" into a winter priority.
 */
const scoredHome = (id: EvidenceId): CategoryId | null =>
    EVIDENCE[id].raisable ? EVIDENCE[id].scoredIn : null;

/**
 * Words that name a subject rather than describe a life.
 *
 * A label built only from these — "Family setup", "Driving routine", "City
 * commuting" — is a filing category, and reading it back to someone tells them
 * nothing they didn't just say.
 */
const TOPIC_WORDS = new Set([
    "age", "ages", "area", "arrangement", "budget", "car", "cars", "children", "kids", "s", "visits", "circumstances", "city", "commute", "commuting", "context",
    "daily", "distance", "distances", "driving", "family", "general", "habits", "household", "life", "lifestyle", "living", "location",
    "needs", "overall", "plans", "preferences", "profile", "requirements", "routine", "setup", "situation",
    "transport", "travel", "trips", "usage", "use", "weekend", "weekends",
]);

const isTopicName = (label: string): boolean => {
    const words = label.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

    return words.length > 0 && words.length <= 3 && words.every((word) => TOPIC_WORDS.has(word));
};

/**
 * The model's understanding, kept only where it holds up, merged over the
 * previous one.
 *
 * Merging is the guard against a turn that forgets: a need established earlier
 * and missing from this reply is carried over unchanged — a need is only ever
 * removed by being marked dropped. Budget, rental period and mileage carry over
 * unless the reply sets them or lists them as cleared.
 */
export function readUnderstanding(
    raw: unknown,
    previous: Understanding,
    enabled: CategoryId[] = CATEGORY_IDS,
    today = new Date().toISOString().slice(0, 7),
    /** What the reader said this turn, when there is a message behind it. */
    message: string | null = null,
): Understanding {
    const wire = (raw ?? {}) as Partial<WireUnderstanding>;
    const cleared = new Set(Array.isArray(wire.cleared) ? wire.cleared : []);

    const category = (value: unknown): value is CategoryId =>
        typeof value === "string" && enabled.includes(value as CategoryId);

    /* -- Constraints ----------------------------------------------------- */

    let budget = cleared.has("budget") ? null : previous.budget;

    /*
     * The model hands back the whole understanding every turn, re-reading
     * the conversation as it goes — and a turn about a mother's mobility is
     * no reason for "500 is the absolute maximum" to come back as "around
     * 500". A budget only changes on a turn where the reader talked about
     * money; otherwise it stays exactly as they last put it.
     */
    const aboutMoney = message == null || previous.budget == null || MONEY.test(message);

    if (aboutMoney && wire.budget && typeof wire.budget.monthly === "number") {
        const monthly = Math.round(wire.budget.monthly);

        if (monthly > 0 && monthly <= 10_000) {
            const stretch = Math.round(Number(wire.budget.stretchTo));

            budget = {
                kind: wire.budget.kind === "target" ? "target" : "hardMax",
                monthly,
                /* Only a stretch above the figure itself, and never a fantasy one. */
                stretchTo: Number.isFinite(stretch) && stretch > monthly && stretch <= monthly * 2 ? stretch : null,
                said: text(wire.budget.said, 160),
            };
        }
    }

    let rental = cleared.has("rental") ? null : previous.rental;

    if (wire.rental && isMonthString(wire.rental.from) && isMonthString(wire.rental.to)) {
        const months = monthsInclusive(wire.rental.from, wire.rental.to);
        const day = Number(wire.rental.startDay);

        if (months >= 1 && months <= MAX_RENTAL_MONTHS && wire.rental.to >= today) {
            rental = {
                from: wire.rental.from,
                to: wire.rental.to,
                startDay: Number.isInteger(day) && day >= 1 && day <= 31 ? day : null,
                said: text(wire.rental.said, 160),
            };
        }
    }

    let monthlyKm = cleared.has("monthlyKm") ? null : previous.monthlyKm;

    if (wire.monthlyKm && typeof wire.monthlyKm.value === "number") {
        const value = Math.round(wire.monthlyKm.value);
        if (value > 0 && value <= 20_000) monthlyKm = { value, said: text(wire.monthlyKm.said, 160) };
    }

    /* -- Needs ----------------------------------------------------------- */

    /*
     * Evidence the person is already confident without doesn't serve their
     * needs — and mustn't pull its priority into the ranking either.
     */
    const lessRelevant = new Set<string>([
        ...(Array.isArray(wire.capabilities) ? wire.capabilities : []).flatMap((item) =>
            Array.isArray(item?.lessRelevant) ? item.lessRelevant : [],
        ),
        ...previous.capabilities.flatMap((item) => item.lessRelevant),
    ]);

    const needs: Need[] = [];

    for (const item of Array.isArray(wire.needs) ? wire.needs : []) {
        const label = text(item?.label, 48);
        if (!label) continue;

        const id = slug(text(item.id, 40) || label);
        if (!id || needs.some((need) => need.id === id)) continue;

        const evidence = (Array.isArray(item.evidence) ? item.evidence : [])
            .filter((entry) => isEvidenceId(entry?.id) && !lessRelevant.has(entry.id))
            .map((entry) => {
                const use = text(entry.use, 120);

                /*
                 * A use clause says what equipment does, not how much of it
                 * there is. Left alone, "Five or more seats — provides four
                 * seats" reaches the reader as a fact Lens never checked —
                 * and the model writes such counts as words as often as
                 * digits.
                 */
                return {
                    id: entry.id as EvidenceId,
                    use: COUNTS.test(use) ? "" : use,
                    /* An SUV body is unwanted unless the model says otherwise. */
                    unwanted: typeof entry.unwanted === "boolean" ? entry.unwanted : EVIDENCE[entry.id as EvidenceId].undesirable === true,
                    mustHave: entry.mustHave === true,
                };
            })
            .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index)
            .slice(0, 6);

        /* A need counts where its scored evidence is scored, as well as where the model placed it. */
        const priorities = [
            ...(Array.isArray(item.priorities) ? item.priorities : []).filter(category),
            ...evidence.map((entry) => scoredHome(entry.id)).filter(category),
        ].filter((value, index, all) => all.indexOf(value) === index);

        /*
         * A need whose evidence is all equipment nobody raises — ISOFIX, air
         * conditioning — and whose priorities the model left out would carry
         * no weight at all. Where it's scored is better than nowhere.
         */
        if (!priorities.length) {
            for (const entry of evidence) {
                const home = EVIDENCE[entry.id].scoredIn;

                if (category(home) && !priorities.includes(home)) priorities.push(home);
            }
        }

        needs.push({
            id,
            label,
            importance: IMPORTANCE.includes(item.importance) ? item.importance : "important",
            said: text(item.said, 200),
            priorities,
            evidence,
            notInData: text(item.notInData, 80) || null,
            status: item.status === "dropped" ? "dropped" : "active",
        });

        if (needs.length >= 8) break;
    }

    for (const earlier of previous.needs) {
        if (!needs.some((need) => need.id === earlier.id)) needs.push(earlier);
    }

    /* -- The rest -------------------------------------------------------- */

    const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

    const context = [
        ...listOf<{ label: string; said: string }>(wire.context)
            .map((item) => {
                const label = text(item?.label, 60);
                const said = text(item?.said, 200);

                /*
                 * A reader reads this back as "You: …", so it has to be their
                 * life and not the name of a subject. When a label comes back
                 * as "Family setup", their own sentence is the better line —
                 * and if that won't fit either, nothing is better than a
                 * heading.
                 */
                return { label: isTopicName(label) ? (said.length <= 60 ? said : "") : label, said };
            })
            .filter((item) => item.label),
        ...previous.context,
    ].filter((item, index, all) => all.findIndex((other) => other.label.toLowerCase() === item.label.toLowerCase()) === index);

    const capabilities = [
        ...listOf<{ label: string; said: string; lessRelevant: unknown[] }>(wire.capabilities)
            .map((item) => ({
                label: text(item?.label, 60),
                said: text(item?.said, 200),
                lessRelevant: listOf<unknown>(item?.lessRelevant).filter(isEvidenceId),
            }))
            .filter((item) => item.label),
        ...previous.capabilities,
    ].filter((item, index, all) => all.findIndex((other) => other.label.toLowerCase() === item.label.toLowerCase()) === index);

    const droppedPriorities = [
        ...listOf<unknown>(wire.droppedPriorities).filter(category),
        ...previous.droppedPriorities,
    ].filter((value, index, all) => all.indexOf(value) === index);

    /* Something now wanted again is no longer dropped. */
    const wanted = new Set(needs.filter((need) => need.status === "active").flatMap((need) => need.priorities));

    const notModelled = [
        ...listOf<{ said: string; stance?: string; explanation: string }>(wire.notModelled)
            .map((item) => ({
                said: text(item?.said, 120),
                stance: item?.stance === "doesntCare" ? ("doesntCare" as const) : ("wants" as const),
                explanation: text(item?.explanation, 220),
            }))
            .filter((item) => item.said && item.explanation),
        ...previous.notModelled,
    ].filter((item, index, all) => all.findIndex((other) => other.said.toLowerCase() === item.said.toLowerCase()) === index)
        .slice(0, 5);

    return {
        budget,
        rental,
        monthlyKm,
        needs,
        context: context.slice(0, 8),
        capabilities: capabilities.slice(0, 5),
        droppedPriorities: droppedPriorities.filter((id) => !wanted.has(id)),
        declined: [...new Set([...listOf<unknown>(wire.declined).filter(isEvidenceId), ...previous.declined])],
        tension: typeof wire.tension === "string" ? text(wire.tension, 200) : previous.tension,
        notModelled,
        /*
         * The reader's own answer, not the model's: a turn that sets a budget
         * takes the waiver off it, and anything else leaves it as it was.
         */
        waived: (previous.waived ?? []).filter((part) => (part === "budget" ? !budget : !rental)),
        /* Tapped, never read from words: a turn leaves it as it was. */
        passengers: previous.passengers ?? null,
    };
}

/**
 * Equipment worth offering: real, not already cited, not already turned down,
 * and something the cars here actually differ on. Offering a reader a feature
 * every car has, or one none of them has, wastes the only question they were
 * going to read.
 */
export function readSuggestions(
    raw: unknown,
    u: Understanding,
    cars: FinnCar[] = [],
): { id: EvidenceId; why: string; needId: string }[] {
    const cited = new Set(u.needs.flatMap((need) => need.evidence.map((entry) => entry.id)));
    const seen = new Set<EvidenceId>();

    return (Array.isArray(raw) ? raw : [])
        .filter((item) => isEvidenceId(item?.id))
        .map((item) => ({ id: item.id as EvidenceId, why: text(item?.why, 160), needId: slug(text(item?.needId, 40)) }))
        .filter((item) => {
            if (cited.has(item.id) || u.declined.includes(item.id) || seen.has(item.id)) return false;

            seen.add(item.id);

            if (cars.length < 2) return true;

            const { listed, total } = coverage(cars, item.id);

            return listed > 0 && listed / total < UNIVERSAL_SHARE;
        })
        .slice(0, 2);
}

/**
 * The two things a reader almost never volunteers, and Lens can't guess.
 *
 * A budget decides which cars are eligible at all, and a rental period decides
 * which FINN term each car is priced on — so a comparison made without them is
 * answering a different question from the one the reader is asking. Lens asks
 * for them itself rather than spending the model's one question on it.
 */
export const missingEssentials = (u: Understanding): { budget: boolean; period: boolean } => {
    /* Sessions written before Lens kept this come back without it. */
    const waived = u.waived ?? [];

    return {
        budget: u.budget == null && !waived.includes("budget"),
        period: u.rental == null && !waived.includes("rental"),
    };
};

const waiving = (u: Understanding, part: "budget" | "rental", waived: boolean): ("budget" | "rental")[] => {
    const kept = (u.waived ?? []).filter((item) => item !== part);

    return waived ? [...kept, part] : kept;
};

/**
 * Dates the reader picked from the chat, without a model turn.
 *
 * Half a period is not a period, and it is not a refusal either: a partial
 * entry leaves the understanding alone rather than recording "no dates", which
 * made the question vanish the moment the first field was filled in.
 */
export const withRental = (
    u: Understanding,
    from: string | null,
    to: string | null,
    said: string,
    startDay: number | null = null,
): Understanding =>
    from && to && isMonthString(from) && isMonthString(to) && monthsInclusive(from, to) >= 1
        ? {
              ...u,
              rental: { from, to, startDay: startDay && startDay >= 1 && startDay <= 31 ? startDay : null, said },
              waived: waiving(u, "rental", false),
          }
        : u;

/** They were asked and had nothing to give: an answer, and Lens stops asking. */
export const waiveEssential = (u: Understanding, part: "budget" | "rental"): Understanding => ({
    ...u,
    ...(part === "budget" ? { budget: null } : { rental: null }),
    waived: waiving(u, part, true),
});

/** A monthly maximum the reader picked from the chat, without a model turn. */
export const withBudget = (u: Understanding, monthly: number | null, said: string): Understanding => ({
    ...u,
    budget: monthly == null ? null : { kind: "hardMax", monthly, stretchTo: null, said },
    waived: waiving(u, "budget", monthly == null),
});

/** The reader said yes: the equipment joins the need it was offered for. */
export function withSuggestion(u: Understanding, id: EvidenceId, why: string, needId: string): Understanding {
    const target = u.needs.find((need) => need.id === needId && need.status === "active") ?? u.needs.find((need) => need.status === "active");

    if (!target) return u;

    return {
        ...u,
        declined: u.declined.filter((item) => item !== id),
        needs: u.needs.map((need) =>
            need.id === target.id
                ? { ...need, evidence: [...need.evidence, { id, use: why, unwanted: false, mustHave: false }].slice(0, 8) }
                : need,
        ),
    };
}

/** The reader said no: never raised, never offered again. */
export const withoutSuggestion = (u: Understanding, id: EvidenceId): Understanding => ({
    ...u,
    declined: [...new Set([...u.declined, id])],
    needs: u.needs.map((need) => ({ ...need, evidence: need.evidence.filter((entry) => entry.id !== id) })),
});

/** A question worth asking, or null: well-formed, and not one already answered. */
export function readQuestion(
    raw: unknown,
    answered: { question: string; answer: string }[],
    cars: FinnCar[] = [],
): WireQuestion | null {
    const wire = raw as Partial<WireQuestion> | null;
    const ask = text(wire?.ask, 160);

    if (!ask) return null;

    const normalise = (value: string) => value.toLowerCase().replace(/[^a-z]+/g, " ").trim();

    if (answered.some((item) => normalise(item.question) === normalise(ask))) return null;

    const affects = (Array.isArray(wire?.affects) ? wire.affects : []).filter(isEvidenceId);

    /*
     * A question is only worth the reader's time if its answer could separate
     * the cars. When everything it would change is listed on nearly every car
     * here — ISOFIX on 22 of 24 — any answer leads to the same comparison.
     */
    if (affects.length && cars.length >= 2) {
        /*
         * Stricter than for an offer: a question holds up the comparison, so
         * the equipment it turns on has to split the cars properly. "Self-
         * steering parking, or are sensors and a camera enough?" was asked
         * over a page where all three sat on 43 to 46 of 48 cars.
         */
        /* A figure Lens can't read as an answer can't separate the cars either. */
        const separates = affects.filter((id) => !AMBIGUOUS_FIGURES.has(id)).some((id) => {
            const { listed, total } = coverage(cars, id);
            /*
             * Only an upper bound. Six electric cars in forty-eight is a real
             * split — "electric only, or everything?" decides between them and
             * the rest — and a lower bound dropped the one question that
             * settled a couple's disagreement.
             */
            return listed > 0 && listed / total <= QUESTION_SPLIT;
        });

        if (!separates) return null;
    }

    return {
        ask,
        why: text(wire?.why, 200),
        options: (Array.isArray(wire?.options) ? wire.options : [])
            .map((option) => text(option, 40))
            .filter(Boolean)
            .slice(0, 4),
        affects,
    };
}

/* -------------------------------------------------------------------------- */
/* Grounding                                                                  */
/* -------------------------------------------------------------------------- */

/** A sentence about Lens's own bookkeeping rather than about the person. */
const BOOKKEEPING = /^(I('ve| have| will|'ll)|Lens (has|will|is))\s+(now\s+)?(set|updated|noted|added|recorded|saved|adjusted|changed|kept|made a note|taken note|updating|noting|setting)\b/i;

/** Every number in a text, without thousands separators: "€1,000 on the 8th" → 1000, 8. */
const numbersIn = (value: string): string[] =>
    (value.match(/\d(?:[\d.,]*\d)?/g) ?? []).map((number) => number.replace(/[.,]/g, "").replace(/^0+(?=\d)/, ""));

/**
 * What the model says back about someone has to come from what they said.
 * A model can fill a gap with a plausible detail — children "aged 1 and 4"
 * when nobody gave an age — and presenting that as understanding is worse
 * than saying less. Numbers are the checkable part: any sentence, context
 * line or paraphrase carrying a number the person never wrote, and Lens
 * didn't derive from what they wrote (the budget, the rental period), is
 * dropped.
 */
export function groundInWhatWasSaid(
    /* Whatever the model sent: a turn can come back with no reply at all. */
    raw: unknown,
    u: Understanding,
    said: string[],
    today = new Date(),
): { reply: string; understanding: Understanding } {
    const reply = text(raw, 400);

    const known = new Set([
        ...said.flatMap(numbersIn),
        String(today.getFullYear()),
        String(today.getFullYear() + 1),
    ]);
    if (u.budget) known.add(String(u.budget.monthly));
    if (u.monthlyKm) known.add(String(u.monthlyKm.value));
    if (u.rental) {
        for (const month of [u.rental.from, u.rental.to]) numbersIn(month.replace("-", " ")).forEach((n) => known.add(n));
        if (u.rental.startDay) known.add(String(u.rental.startDay));
    }

    /*
     * FINN's own allowance is a fact Lens publishes, not a detail about the
     * person, and "around 2,100 km" is a fair rounding of the 2,064 Lens
     * worked out from their commute. Dropping those threw away the one
     * sentence that answered "does the move change anything?".
     */
    known.add(String(FINN_INCLUDED_MONTHLY_KM));
    if (u.monthlyKm) known.add(String(Math.max(0, u.monthlyKm.value - FINN_INCLUDED_MONTHLY_KM)));

    const derived = [u.monthlyKm?.value, u.budget?.monthly, u.budget?.stretchTo].filter((value): value is number => Boolean(value));
    const rounds = (number: string) => derived.some((value) => Math.abs(Number(number) - value) <= value * 0.05);

    const grounded = (value: string) => numbersIn(value).every((number) => known.has(number) || rounds(number));

    const sentences = reply.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
    const checked = sentences.filter(grounded);
    /*
     * "I've updated your needs…" is bookkeeping, and the strip above the
     * conversation already shows it. Said after a sentence that shows Lens
     * understood, it only dilutes it; said alone, it's all there is.
     */
    const substance = checked.filter((sentence) => !BOOKKEEPING.test(sentence.trim()));
    const kept = (substance.length ? substance : checked).join("").trim();

    return {
        reply: kept || (sentences.length ? "Here's what I took from that." : reply),
        understanding: {
            ...u,
            tension: grounded(u.tension) ? u.tension : "",
            context: u.context.filter((item) => grounded(item.label) && grounded(item.said)),
            needs: u.needs.map((need) => (grounded(need.said) ? need : { ...need, said: "" })),
        },
    };
}

/**
 * What the reader ruled out: evidence they want absent, on a need they call
 * essential.
 *
 * This is a constraint, not a preference — the same shape as a hard budget.
 * Lens can't score body type, and inventing a score for it would be Lens
 * making something up; setting those cars aside is what the person actually
 * asked for, and saying how many were set aside keeps it honest.
 */
export function ruledOut(u: Understanding): Rule[] {
    const seen = new Set<EvidenceId>();

    return u.needs
        .filter((need) => need.status === "active" && need.importance === "essential")
        .flatMap((need) =>
            need.evidence
                .filter((entry) => (entry.unwanted || entry.mustHave) && !seen.has(entry.id) && seen.add(entry.id))
                .map((entry) => ({
                    id: entry.id,
                    mode: entry.unwanted ? ("without" as const) : ("must" as const),
                    label: entry.unwanted ? withoutLabel(entry.id) : EVIDENCE[entry.id].label,
                    said: need.said || need.label,
                })),
        );
}

/** A rule the reader gave about the cars themselves, not about what they cost. */
export interface Rule {
    id: EvidenceId;
    /** "without": set those cars aside. "must": keep only those cars. */
    mode: "without" | "must";
    label: string;
    said: string;
}

/** The understanding sent back to the model on the next turn. */
export const toWire = (u: Understanding): WireUnderstanding => ({ ...u, cleared: [] });

/* -------------------------------------------------------------------------- */
/* Into Lens's own answers                                                    */
/* -------------------------------------------------------------------------- */

const RANK: Record<NeedImportance, number> = { essential: 3, important: 2, niceToHave: 1 };

const RAISE: Record<NeedImportance, FeatureImportance> = {
    essential: "high",
    important: "medium",
    niceToHave: "low",
};

export interface Translation {
    answers: Answers;
    /** Priorities in the order Lens will weigh them, and which needs put each there. */
    order: { id: CategoryId; from: string[]; filler: boolean }[];
    /** Evidence the person made less relevant, removed from anything raised. */
    lessRelevant: EvidenceId[];
    /** The session's own profile: what Lens is paying attention to this time. */
    profile: SessionProfile;
}

/**
 * The temporary profile this conversation builds.
 *
 * It exists for the search in front of the reader and nothing else: their
 * saved priorities, profiles and raised features are read for the priorities
 * the conversation says nothing about, and are never written. Everything here
 * is derived from what they said, so it can be shown back to them in their own
 * words and followed from a sentence down to a score.
 */
export interface SessionProfile {
    /** What Lens is paying attention to, in the reader's words: their needs. */
    focus: { label: string; importance: NeedImportance }[];
    /** The engine's own order and weights, for anyone who wants the numbers. */
    priorities: { id: CategoryId; label: string; sharePercent: number; from: string[]; filler: boolean }[];
    /** Rules that set cars aside before ranking. */
    rules: Rule[];
    /** One row per need: the sentence, the Lens concepts, the features raised. */
    trace: {
        need: string;
        said: string;
        importance: NeedImportance;
        priorities: { id: CategoryId; label: string }[];
        raised: { id: EvidenceId; label: string; importance: FeatureImportance }[];
        rules: { id: EvidenceId; label: string; mode: "without" | "must" }[];
        /** What this need asked for that FINN doesn't publish. */
        unpublished: string | null;
    }[];
}

/**
 * What the engine is given.
 *
 * The order comes from the needs, strongest first — not from whatever the
 * reader's saved settings or a default profile happened to rank. Lens needs at
 * least three priorities; if the needs name fewer, the rest are taken from the
 * saved order, never from anything the person said they don't care about, and
 * marked as filler. Inside a priority the needs' own evidence is raised; a
 * priority no need speaks to keeps its saved emphasis. Evidence a capability
 * made less relevant is never raised.
 */
export function toAnswers(
    base: Answers,
    u: Understanding,
    enabled: CategoryId[] = CATEGORY_IDS,
    /**
     * Pad the order to `MIN_PRIORITIES` from the base's own priorities. The
     * chat doesn't: a priority nothing the reader said points to is Lens
     * judging cars on something they never asked about.
     */
    { fill = true, onlyAsked = false }: {
        fill?: boolean;
        /**
         * Rank on what the reader asked for and nothing else — the chat's
         * mode. A need's priorities are where its equipment is scored, a
         * standard item it names counts like a raised one, and a priority's
         * other items weigh nothing. See `LensPreferences.countOnlyAsked`.
         */
        onlyAsked?: boolean;
    } = {},
): Translation {
    const active = u.needs.filter((need) => need.status === "active");
    const dropped = new Set(u.droppedPriorities);
    const lessRelevant = [...new Set([...u.capabilities.flatMap((item) => item.lessRelevant), ...u.declined])];
    const rules = ruledOut(u);

    /*
     * Evidence that can move a score. A rule's own evidence can't: every car
     * left after the rule has it, so raising it only adds the same to each —
     * and "a towbar" came back as a reason the winner won. That holds
     * whichever need names it: a commute's automatic gearbox, beside an
     * "automatic only" rule, put all of City & Parking in the order to score
     * a thing every car left has.
     */
    const counts = (entry: Need["evidence"][number]) =>
        !entry.unwanted &&
        !lessRelevant.includes(entry.id) &&
        !rules.some((rule) => rule.id === entry.id) &&
        (onlyAsked ? EVIDENCE[entry.id].scoredIn != null : EVIDENCE[entry.id].raisable);

    /*
     * Where a need counts. Asked-only, that is wherever its equipment is
     * scored, and nowhere else: "kids in the back" named Safety and held
     * nothing Safety scores, so every parent was judged on blind spot
     * warning; its rear USB ports are scored under Comfort, which it never
     * named, so they counted nowhere. A need with no equipment at all —
     * emissions — keeps the priority it names.
     */
    const prioritiesOf = (need: Need): CategoryId[] => {
        if (!onlyAsked) return need.priorities;

        const homes = need.evidence.filter(counts).map((entry) => EVIDENCE[entry.id].scoredIn!);
        const figures = need.priorities.filter((id) => CATEGORIES[id].numericOnly);

        return [...new Set([...homes, ...figures, ...(homes.length ? [] : need.priorities)])];
    };

    const scores = new Map<CategoryId, { score: number; breadth: number; first: number; from: string[] }>();

    /*
     * A need's weight goes to its priorities by how much of it each one
     * actually holds: one share for being named, one for each piece of the
     * need's evidence a reader could raise there. Taking the need's full
     * importance for every priority it touched let one incidental sensor put
     * a whole priority first — "dark roads" cites rain and light sensors,
     * which live under climate, and climate came out at 40% of the result
     * for someone who never mentioned the weather.
     *
     * The strongest single need decides the place; how many needs a priority
     * serves only breaks ties, so a need the reader has just called essential
     * still goes first over several small ones that share a priority.
     */
    active.forEach((need, index) => {
        const holds = new Map<CategoryId, number>();

        /* Asked-only, a priority holds a need by its equipment alone: being named is no share of it. */
        for (const id of prioritiesOf(need)) holds.set(id, onlyAsked ? 0 : 1);
        for (const entry of need.evidence) {
            const home = onlyAsked ? (counts(entry) ? EVIDENCE[entry.id].scoredIn : null) : scoredHome(entry.id);

            if (home && holds.has(home) && !entry.unwanted && !lessRelevant.includes(entry.id)) {
                holds.set(home, holds.get(home)! + 1);
            }
        }
        /* A figure-only priority (emissions) is the whole of its need. */
        for (const [id, share] of holds) if (share === 0) holds.set(id, 1);

        /*
         * Relative to the priority that holds most of the need, not to the
         * total: a commute that bears on long-distance and on safety is no
         * less a commute than weekend parking that bears on one priority.
         */
        const most = Math.max(...holds.values());

        for (const [id, share] of holds) {
            if (dropped.has(id) || !enabled.includes(id)) continue;

            const current = scores.get(id) ?? { score: 0, breadth: 0, first: index, from: [] };
            const weight = (RANK[need.importance] * share) / most;
            current.score = Math.max(current.score, weight);
            current.breadth += weight;
            current.from.push(need.label);
            scores.set(id, current);
        }
    });

    const ranked = [...scores.entries()]
        .sort((a, b) => b[1].score - a[1].score || b[1].breadth - a[1].breadth || a[1].first - b[1].first)
        /*
         * Five is a settings screen's limit on a reader's own order. In a
         * chat every priority here holds something they asked for, and a
         * reader who picked every need had City & Parking cut — their
         * parking needs counted nowhere while the story still reported on
         * them. The last in the order weighs little, but it counts.
         */
        .slice(0, onlyAsked ? undefined : MAX_PRIORITIES)
        .map(([id, entry]) => ({ id, from: entry.from, filler: false }));

    const order = [...ranked];

    for (const id of fill ? [...base.priorities, ...CATEGORY_IDS] : []) {
        if (order.length >= MIN_PRIORITIES) break;
        if (order.some((item) => item.id === id) || dropped.has(id) || !enabled.includes(id)) continue;

        order.push({ id, from: [], filler: true });
    }

    /*
     * Only if dropping left too few does a dropped priority come back, as
     * filler — the ones dropped last-mentioned first, so an explicit "I don't
     * care about comfort" (usually named first) is the last to return.
     */
    for (const id of fill ? [...u.droppedPriorities].reverse() : []) {
        if (order.length >= MIN_PRIORITIES) break;
        if (order.some((item) => item.id === id)) continue;

        order.push({ id, from: [], filler: true });
    }

    /*
     * A priority the conversation put there is emphasised by the conversation
     * alone: the reader's saved raises describe a different search. Only the
     * filler priorities — the ones nothing in the conversation speaks to —
     * keep what the reader saved.
     */
    const fromNeeds = new Set(ranked.map((item) => item.id));

    const features = Object.fromEntries(
        CATEGORY_IDS.map((id) => [id, fromNeeds.has(id) ? [] : [...(base.features[id] ?? [])]]),
    ) as Answers["features"];

    for (const { id } of order) {
        const raised = new Map<SignalId, FeatureImportance>();

        for (const need of active) {
            for (const entry of need.evidence) {
                const def = EVIDENCE[entry.id];

                /*
                 * What they want absent is a rule or a note, never a raise:
                 * raising "a seven-seater" for someone who said "not a
                 * seven-seater" told the engine to reward exactly that, and
                 * the car that honoured them came back with "fewer than six
                 * seats" as its catch.
                 */
                if (def.scoredIn !== id || !counts(entry)) continue;

                const level = RAISE[need.importance];
                const existing = raised.get(entry.id as SignalId);

                if (!existing || RANK_FEATURE[level] > RANK_FEATURE[existing]) raised.set(entry.id as SignalId, level);
            }
        }

        if (raised.size) {
            features[id] = [...raised.entries()]
                .sort((a, b) => RANK_FEATURE[b[1]] - RANK_FEATURE[a[1]])
                /*
                 * The cap is for a settings screen, where it limits what one
                 * person singles out. In a chat every item was asked for, and
                 * cutting at five dropped the heat pump and auxiliary heater a
                 * reader had just said yes to.
                 */
                .slice(0, onlyAsked ? undefined : MAX_FEATURES_PER_CATEGORY)
                .map(([key, importance]) => ({ key, importance, source: "user" as const }));
        }
    }

    for (const id of CATEGORY_IDS) {
        features[id] = (features[id] ?? []).filter((item) => !lessRelevant.includes(item.key));
    }

    const preferences = { ...base.preferences };

    if (u.budget) preferences.monthlyBudget = budgetCeiling(u.budget);
    if (u.rental) {
        preferences.rentalFrom = u.rental.from;
        preferences.rentalTo = u.rental.to;
    }
    if (u.monthlyKm) preferences.monthlyKm = u.monthlyKm.value;
    if (onlyAsked) {
        preferences.countOnlyAsked = true;

        /*
         * Each need weighs what its importance says, split across the
         * priorities its equipment sits in, and each priority's share is
         * what its needs put there. By place in the order alone, one need's
         * matrix headlights (Safety) counted twice its cornering lights
         * (Climate) — and a need is a need however many items Lens checks
         * for it, so seven for kids don't outweigh one CO₂ figure seven to
         * one either.
         */
        const shares: Partial<Record<CategoryId, number>> = {};
        const ranked = new Set(order.map((item) => item.id));

        for (const need of active) {
            const weight = FEATURE_IMPORTANCE[RAISE[need.importance]].weight;
            const homes = need.evidence
                .filter(counts)
                .map((entry) => EVIDENCE[entry.id].scoredIn!)
                .filter((id) => ranked.has(id));
            const into = homes.length ? homes : prioritiesOf(need).filter((id) => ranked.has(id));

            for (const id of into) shares[id] = (shares[id] ?? 0) + weight / into.length;
        }

        preferences.priorityShares = shares;
        /* The order follows the shares, so "you put X first" names the heaviest. */
        order.sort((a, b) => (shares[b.id] ?? 0) - (shares[a.id] ?? 0));
    }

    const weights = priorityWeights(order.map((item) => item.id), preferences.priorityShares);
    const raisedIn = (need: Need): { id: EvidenceId; label: string; importance: FeatureImportance }[] =>
        need.evidence
            .filter((entry) => {
                const def = EVIDENCE[entry.id];

                return counts(entry) && order.some((item) => item.id === def.scoredIn);
            })
            .map((entry) => ({ id: entry.id, label: EVIDENCE[entry.id].label, importance: RAISE[need.importance] }));

    return {
        answers: {
            priorities: order.map((item) => item.id),
            preferences,
            features,
            basedOn: null,
        },
        order,
        lessRelevant,
        profile: {
            focus: active
                .slice()
                .sort((a, b) => RANK[b.importance] - RANK[a.importance])
                .map((need) => ({ label: need.label, importance: need.importance })),
            priorities: order.map((item) => ({
                id: item.id,
                label: CATEGORIES[item.id].label,
                sharePercent: weights.find((weight) => weight.priority === item.id)?.weightPercent ?? 0,
                from: item.from,
                filler: item.filler,
            })),
            rules,
            trace: active.map((need) => ({
                need: need.label,
                said: need.said,
                importance: need.importance,
                priorities: prioritiesOf(need)
                    .filter((id) => order.some((item) => item.id === id))
                    .map((id) => ({ id, label: CATEGORIES[id].label })),
                raised: raisedIn(need),
                rules: need.evidence
                    .filter((entry) => rules.some((rule) => rule.id === entry.id))
                    .map((entry) => ({
                        id: entry.id,
                        label: EVIDENCE[entry.id].label,
                        mode: entry.unwanted ? ("without" as const) : ("must" as const),
                    })),
                unpublished: need.notInData,
            })),
        },
    };
}

const RANK_FEATURE: Record<FeatureImportance, number> = { high: 3, medium: 2, low: 1 };

/* -------------------------------------------------------------------------- */
/* Describing a change of understanding                                       */
/* -------------------------------------------------------------------------- */

const euros = (value: number) => `€${value.toLocaleString("en-GB")}`;

/**
 * How far above a soft figure Lens will still look, when the reader doesn't
 * say.
 *
 * "Around €600, a bit more for a good reason" is not "no limit": ignoring it
 * put a €1,353 car in front of someone who said €600. A target is held to a
 * little headroom instead, and the fit story says where the line was drawn.
 * Where they name the stretch themselves — "€400, maybe €425" — that figure
 * is the line, because a guess has no business overriding what they said.
 */
export const TARGET_HEADROOM = 1.15;

/** The most Lens will let a car cost, given what the person said about money. */
export const budgetCeiling = (budget: NonNullable<Understanding["budget"]>): number =>
    budget.stretchTo ?? (budget.kind === "hardMax" ? budget.monthly : Math.round(budget.monthly * TARGET_HEADROOM));

export function budgetText(budget: Understanding["budget"]): string {
    if (!budget) return "No limit";
    return budget.kind === "hardMax" ? `${euros(budget.monthly)}/month maximum` : `Around ${euros(budget.monthly)}/month`;
}

/** What a what-if changes, as plain before-and-after lines. */
export function diffUnderstanding(before: Understanding, after: Understanding): { label: string; from: string; to: string }[] {
    const lines: { label: string; from: string; to: string }[] = [];

    if (budgetText(before.budget) !== budgetText(after.budget)) {
        lines.push({ label: "Budget", from: budgetText(before.budget), to: budgetText(after.budget) });
    }

    const period = (rental: Understanding["rental"]) => (rental ? `${rental.from} → ${rental.to}` : "Not set");

    if (period(before.rental) !== period(after.rental)) {
        lines.push({ label: "Rental period", from: period(before.rental), to: period(after.rental) });
    }

    const importanceText: Record<NeedImportance, string> = {
        essential: "Must have",
        important: "Important",
        niceToHave: "Nice to have",
    };

    for (const need of after.needs) {
        const was = before.needs.find((item) => item.id === need.id);
        const now = need.status === "dropped" ? "Doesn't matter" : importanceText[need.importance];
        const then = !was ? "—" : was.status === "dropped" ? "Doesn't matter" : importanceText[was.importance];

        if (now !== then) lines.push({ label: need.label, from: then, to: now });
    }

    for (const id of after.droppedPriorities) {
        if (!before.droppedPriorities.includes(id)) {
            lines.push({ label: CATEGORIES[id].label, from: "Weighed", to: "Not weighed" });
        }
    }

    return lines;
}
