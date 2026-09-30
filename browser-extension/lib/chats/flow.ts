import { lowerFirst } from "@/lib/reasoning-engine/format";
import { formatEUR } from "@/lib/reasoning-engine";
import { FINN_INCLUDED_MONTHLY_KM } from "@/lib/reasoning-engine/constants";
import { addMonths, monthLabel, type MonthString } from "@/lib/reasoning-engine/contract";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import { asPhrase, coverage, EVIDENCE, type EvidenceId } from "@/lib/lens-chat/evidence";
import { applyChoices, explain, guideSteps, NEED_GROUPS, saidFor, type GuideChoice, type GuideStep, type NeedGroup } from "@/lib/lens-chat/guide";
import {
    EMPTY_UNDERSTANDING,
    ruledOut,
    waiveEssential,
    withBudget,
    withoutSuggestion,
    withRental,
    withSuggestion,
    type Understanding,
} from "@/lib/lens-chat/understanding";
import type { FinnCar } from "@/lib/types";

import { applyFollowUp, followUpFor, offerReason, worthALook } from "./follow-ups";
import { BASE_ANSWERS, chatAnswers } from "./judge";
import { messageId, newChatId } from "./store";
import type { Chat, ChatMessage, ChatStep, SavedSettings, StepId } from "./types";

/**
 * How a conversation with Lens goes, as pure functions over a `Chat`.
 *
 * Every step returns the next chat; nothing here waits, reads storage or runs
 * the engine, so the whole conversation can be walked in a test. The chat
 * page owns the timing (Lens "typing"), reading what the reader types, and
 * the judgement itself.
 *
 * The shape of it:
 *
 * 1. Lens greets the reader and says what's about to happen.
 * 2. It asks what the car has to do, with a follow-up for the needs where one
 *    answer changes what it looks for, and — when there are several — which
 *    matters most. Then anything that rules a car out, the monthly limit,
 *    how long, and how far. Last, equipment worth a look: things the reader's
 *    needs touch on that the cars here actually differ on.
 * 3. Every question says why it's asked, has answers to tap, and takes the
 *    reader's own answer too. Anything already said isn't asked again.
 * 4. Lens says back what it will judge by — the reader's needs and how much
 *    each counts, and the limits — any of which can be changed from there,
 *    and asks whether to keep it as their settings or for this chat only.
 * 5. It judges the cars on the page (the chat page does this part).
 *
 * A reader with saved settings is greeted with them instead, and can judge
 * straight away, change something, or start from scratch.
 */

/** The questions, in the order Lens asks them. Follow-ups are slotted in behind "life". */
export const STEP_ORDER: StepId[] = ["life", "focus", "rules", "budget", "period", "distance", "offers"];

/** Equipment offered at most, so the questions end. */
const MAX_OFFERS = 2;

const now = () => new Date().toISOString();

const lens = (text: string): ChatMessage => ({ id: messageId(), at: now(), from: "lens", kind: "text", text });
const reader = (text: string): ChatMessage => ({ id: messageId(), at: now(), from: "reader", kind: "text", text });

const joined = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const lower = lowerFirst;

const lifeNeeds = (u: Understanding) => u.needs.filter((need) => need.status === "active" && need.priorities.length > 0);

const LEVEL: Record<NeedImportance, number> = { essential: 3, important: 2, niceToHave: 1 };

/**
 * The needs sharing the highest importance any of them has. How many ride
 * along is a fact about the reader, not something to rank against the rest.
 */
/* -------------------------------------------------------------------------- */
/* How many ride along, checked against what was typed                        */
/* -------------------------------------------------------------------------- */

const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/**
 * People the reader's own words number: "2 teenagers, 2 kids" is four. Only
 * a number beside a word for people counts — "my wife" might be the one
 * passenger already counted, and two dogs need no seats.
 */
export function peopleIn(text: string): number | null {
    const matches = [
        ...text.matchAll(
            /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:\w+\s+)?(people|persons|passengers?|adults?|kids?|child(?:ren)?|teens?|teenagers?|boys?|girls?|sons?|daughters?|friends?|colleagues?|grandchildren|grandkids|parents|toddlers?|bab(?:y|ies))\b/gi,
        ),
    ];

    if (!matches.length) return null;

    return matches.reduce((sum, match) => sum + (COUNT_WORDS[match[1]!.toLowerCase()] ?? Number(match[1])), 0);
}

/**
 * What a number of passengers asks of the car: nothing (beside the driver),
 * rear doors (someone in the back), five seats, six. Two counts on the same
 * step ask the same of the car, so telling them apart changes nothing.
 */
const seatStep = (passengers: number) => (passengers >= 5 ? 3 : passengers === 4 ? 2 : passengers >= 2 ? 1 : 0);

/** The check to ask, when the words give more people than the count and that changes the seats or doors. */
function seatCheck(text: string, passengers: number | null): StepId | null {
    const typed = peopleIn(text);

    if (typed == null || passengers == null || typed <= passengers || seatStep(typed) <= seatStep(passengers)) return null;

    return `check-passengers-${typed}`;
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n: number) => NUMBER_WORDS[n] ?? String(n);

/* -------------------------------------------------------------------------- */
/* Changing some answers                                                      */
/* -------------------------------------------------------------------------- */

/** The questions a reader can pick to answer again, in the order they're asked. */
const CHANGEABLE: StepId[] = ["life-passengers", "life-people", "life-driving", "life-parking", "life-weather", "life-loads", "life-you", "rules", "budget", "period", "distance"];

const CHANGE_LABEL: Partial<Record<StepId, string>> = {
    "life-passengers": "How many ride with you",
    "life-people": "Who rides with you",
    "life-driving": "Your driving",
    "life-parking": "Where you park",
    "life-weather": "The weather",
    "life-loads": "What you carry or tow",
    "life-you": "Anything else",
    rules: "Must-haves & must-nots",
    budget: "Monthly limit",
    period: "How long",
    distance: "How far you drive",
};

/** What a question's answer is now, in a few words: "€700 a month", "travelling with children and pets". */
function nowSaid(step: StepId, u: Understanding, cars: FinnCar[]): string {
    switch (step) {
        case "life-passengers":
            return u.passengers == null ? "not answered" : u.passengers === 0 ? "just you" : `${u.passengers >= 5 ? "5 or more" : u.passengers}`;
        case "rules":
            return rulesText(u).toLowerCase() === "none" ? "none" : lowerFirst(rulesText(u));
        case "budget":
            return u.budget ? `${formatEUR(u.budget.monthly)} a month` : "no fixed limit";
        case "period":
            return u.rental ? `${monthLabel(u.rental.from)} to ${monthLabel(u.rental.to)}` : "not set";
        case "distance":
            return u.monthlyKm ? `about ${u.monthlyKm.value.toLocaleString("en-GB")} km a month` : "not said";
    }

    const group = step.slice("life-".length);
    const own = new Set((guideSteps(cars).find((item) => item.id === "life")?.choices ?? []).filter((choice) => choice.group === group).map((choice) => `life-${choice.id}`));
    const labels = lifeNeeds(u).filter((need) => own.has(need.id)).map((need) => lower(need.label));

    return labels.length ? joined(labels) : "nothing";
}

/** A level this crowded says little: with this many needs on it, each counts for too little to decide anything. */
const CROWDED = 5;

/** At most this many can be picked out of a crowded level, or picking them says nothing either. */
const PICK_UP_TO = 3;

/**
 * The needs worth ranking against each other: a tie at the top, or — when
 * one need already leads — the most crowded level below it. A reader who
 * named fifteen things at "important" had each counting for about 6%, and
 * nothing asked which of them mattered.
 *
 * How many ride along is a fact about the reader, and a rule isn't a
 * preference: neither is put up against the rest, and a rule stepped down
 * here would stop being one.
 */
const contested = (u: Understanding) => {
    const needs = lifeNeeds(u).filter(
        (need) => !need.id.startsWith("life-passengers-") && !need.evidence.some((entry) => entry.mustHave || entry.unwanted),
    );
    const top = Math.max(0, ...needs.map((need) => LEVEL[need.importance]));
    const atTop = needs.filter((need) => LEVEL[need.importance] === top);

    if (atTop.length >= 2) return atTop;

    const levels = [...new Set(needs.map((need) => LEVEL[need.importance]))].map((level) => needs.filter((need) => LEVEL[need.importance] === level));

    return levels.sort((a, b) => b.length - a.length).find((level) => level.length >= CROWDED) ?? [];
};

/* -------------------------------------------------------------------------- */
/* The questions                                                              */
/* -------------------------------------------------------------------------- */

const BUDGETS = [300, 400, 500, 700, 1000];

const PERIODS: { months: number; label: string; said: string }[] = [
    { months: 6, label: "6 months", said: "I need it for about 6 months." },
    { months: 12, label: "A year", said: "I need it for about a year." },
    { months: 18, label: "18 months", said: "I need it for about 18 months." },
    { months: 24, label: "2 years", said: "I need it for about 2 years." },
];

export const IMPORTANCE_LABEL: Record<NeedImportance, string> = {
    essential: "Must have",
    important: "Important",
    niceToHave: "Nice to have",
};

/** The month a new rental would start: next month, since FINN delivers in weeks, not days. */
export function startMonth(today = new Date()): MonthString {
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` as MonthString;

    return addMonths(month, 1);
}

/** A rental of `months`, starting next month. */
export function rentalFor(u: Understanding, months: number, said: string, today = new Date()): Understanding {
    const from = startMonth(today);

    return withRental(u, from, addMonths(from, months - 1), said);
}

const labelsOf = (ids: EvidenceId[]) => ids.map((id) => EVIDENCE[id]?.label).filter((label): label is string => Boolean(label));

/**
 * What Lens actually checks for a need: the equipment it scores. Boot space
 * is read and quoted, never scored — "I'll check boot space" would be a
 * promise the ranking doesn't keep.
 */
const checked = (need: Understanding["needs"][number], u: Understanding): EvidenceId[] => {
    /* Nor what a rule already settles: once "automatic only" sets the rest aside, every car left has the gearbox. */
    const settled = new Set(ruledOut(u).map((rule) => rule.id));

    return need.evidence.filter((entry) => !entry.unwanted && EVIDENCE[entry.id]?.scoredIn != null && !settled.has(entry.id)).map((entry) => entry.id);
};

/**
 * The needs, asked a group at a time: a short question the reader can
 * answer in a glance, rather than seventeen chips at once. Each says why it
 * matters, and each has its own way of saying "none of these".
 */
/*
 * How many answers make sense. Where you park most often is one or two
 * places — home and work — so that question takes two. Elsewhere every
 * answer that's a regular part of someone's life counts, and a reader who
 * taps a lot is asked which matter most afterwards.
 */
const GROUP_ASK: Record<NeedGroup, { ask: string; why: string; none: string; placeholder: string; max?: number }> = {
    passengers: {
        ask: "First, how many people usually ride with you?",
        why: "It decides how many seats and doors the car needs.",
        none: "Just me",
        placeholder: "e.g. “my mum, who uses a walker”",
    },
    people: {
        ask: "Who are they, usually?",
        why: "Children, adults and pets each need different things from a car. Tap all that apply — the “i” on an answer shows what I'd check.",
        none: "Rather not say",
        placeholder: "e.g. “two teenagers and a big dog”",
    },
    parking: {
        ask: "Where do you park most often?",
        why: "Pick the one or two you use most, like home and work. Each kind of space calls for its own help.",
        max: 2,
        none: "Parking's no trouble",
        placeholder: "e.g. “parking stresses me out”",
    },
    driving: {
        ask: "What kind of driving do you do most?",
        why: "Tap each that's a regular part of your driving. The “i” on an answer says what it means and what I'd check.",
        none: "None of these",
        /* Every example is one Lens can read: its own example coming back "couldn't find anything" is the worst advert. */
        placeholder: "e.g. “home late after night shifts”",
    },
    weather: {
        ask: "What's the weather like where you live?",
        why: "Cold winters and hot summers each need their own equipment. The “i” on an answer shows what I'd check.",
        none: "Nothing unusual",
        placeholder: "e.g. “snowy winters”",
    },
    loads: {
        ask: "What do you carry or tow?",
        why: "Tap each you carry or tow regularly. Different loads need different equipment — the “i” on an answer shows what I'd check.",
        none: "Nothing much",
        placeholder: "e.g. “a double buggy”",
    },
    you: {
        ask: "Anything else that matters to you in a car?",
        why: "Each adds equipment to what I check — or, for emissions, each car's CO₂. The “i” on an answer says what it means and what I'd check.",
        none: "Nothing else",
        placeholder: "e.g. “something safe and efficient”",
    },
};

const WHY: Record<string, string> = {
    rules: "Anything you pick here takes cars out before I score them, so only choose what you'd truly refuse.",
    budget: "A car over your limit can't be my pick. I compare each car's FINN price plus estimated fuel or charging and the mileage package your distance needs.",
    period: "FINN prices each car by how long you subscribe, and not every car is offered for every length — so this changes both the price and which cars fit.",
    distance: `FINN's price includes ${FINN_INCLUDED_MONTHLY_KM.toLocaleString("en-GB")} km a month; more needs one of FINN's mileage packages, which adds to each car's price. Your distance also sets what fuel or charging costs you.`,
    focus: "When no car has everything, the need you pick counts most in the ranking, and the others count a step less.",
};

/** An answer this much of whose checks another picked answer already makes is set aside. */
const MOSTLY = 0.75;

/**
 * Which answers each one mostly covers: at least three quarters of what Lens
 * would check for the other is already on its own list. Worked out from the
 * equipment on these cars, so it holds for this page and says why.
 */
function coverageOf(choices: ChatStep["choices"]): ChatStep["covers"] {
    const covers: NonNullable<ChatStep["covers"]> = {};

    for (const picked of choices) {
        for (const other of choices) {
            if (other.id === picked.id || !picked.looksFor?.length || !other.looksFor?.length) continue;

            const shared = other.looksFor.filter((label) => picked.looksFor!.includes(label));

            if (shared.length / other.looksFor.length >= MOSTLY) (covers[picked.id] ??= []).push({ id: other.id, shared });
        }
    }

    return Object.keys(covers).length ? covers : undefined;
}

const fromGuide = (step: GuideStep): ChatStep => {
    const choices = step.choices.map(({ id, label, said, description, means, group, need }) => ({
        id,
        label,
        said,
        description,
        means,
        group,
        looksFor: need ? labelsOf(need.evidence) : undefined,
        features: need?.evidence
            .filter((evidence) => EVIDENCE[evidence])
            .map((evidence) => ({ label: EVIDENCE[evidence].label, does: explain(evidence, need.reasons?.[evidence]) })),
    }));

    return {
        id: step.id,
        ask: step.ask,
        why: WHY[step.id],
        multiple: step.multiple,
        choices,
        covers: step.multiple ? coverageOf(choices) : undefined,
        none: step.none,
        guide: step,
    };
};

/**
 * Who rides along, asked in the light of how many do: with nobody, only
 * whether a pet does; with one, an adult asks nothing of the car, since they
 * sit beside the driver.
 */
function whoRides(choices: GuideChoice[], passengers: number | null): { choices: GuideChoice[]; ask: string; none?: string; multiple: boolean; exclusive?: string[][] } {
    if (passengers === 0) {
        return { choices: choices.filter((choice) => choice.id === "dog"), ask: "Any pets riding along?", none: "No pets", multiple: false };
    }

    if (passengers === 1) {
        return {
            choices: choices.map((choice) =>
                choice.id === "adults"
                    ? { ...choice, need: undefined, description: "One adult can sit beside you, so there's nothing extra to check for them." }
                    : choice,
            ),
            ask: "Who is it, usually? And any pets?",
            none: GROUP_ASK.people.none,
            multiple: true,
            /* One person is a child or an adult, not both; a pet can come too. */
            exclusive: [["kids", "adults"]],
        };
    }

    return { choices, ask: GROUP_ASK.people.ask, none: GROUP_ASK.people.none, multiple: true };
}

/** Taps held to what the question allows: the first of answers that exclude each other, and no more than its limit. */
export function withinLimits(step: Pick<ChatStep, "max" | "exclusive" | "covers">, chosen: string[]): string[] {
    let kept = [...new Set(chosen)];

    for (const set of step.exclusive ?? []) {
        const first = kept.find((id) => set.includes(id));
        kept = kept.filter((id) => !set.includes(id) || id === first);
    }

    /* In the order picked: an answer something picked before it mostly covers is set aside, as the page does. */
    kept = kept.filter((id, index) => !kept.slice(0, index).some((earlier) => coveredBy(step, earlier, id)));

    return step.max ? kept.slice(0, step.max) : kept;
}

/** What `picked` shares with `other`, when it mostly covers it; null when it doesn't. */
export function coveredBy(step: Pick<ChatStep, "covers">, picked: string, other: string): string[] | null {
    return step.covers?.[picked]?.find((entry) => entry.id === other)?.shared ?? null;
}

/** Lens's question for `id`, narrowed to what's worth asking about these cars. Null when it isn't. */
export function stepFor(id: StepId, cars: FinnCar[], u: Understanding = EMPTY_UNDERSTANDING): ChatStep | null {
    switch (id) {
        case "budget":
            return {
                id,
                ask: "What's the most you'd spend a month?",
                why: WHY.budget,
                multiple: false,
                choices: BUDGETS.map((amount) => ({ id: `budget-${amount}`, label: `Up to ${formatEUR(amount)}`, said: `Up to ${formatEUR(amount)} a month.` })),
                none: "No fixed limit",
                custom: { kind: "amount", label: "Another amount", placeholder: "e.g. 650", min: 100, max: 5000 },
            };

        case "period":
            return {
                id,
                ask: "How long do you need the car for?",
                why: WHY.period,
                multiple: false,
                choices: PERIODS.map((period) => ({ id: `period-${period.months}`, label: period.label, said: period.said })),
                none: "Not sure yet",
                custom: { kind: "months", label: "Another length", placeholder: "months, e.g. 9", min: 1, max: 48 },
            };

        case "focus": {
            /*
             * Only a tie needs breaking: a tie at the top, or a crowd below
             * one need that already leads. Otherwise the reader has answered.
             */
            const needs = contested(u);

            if (needs.length < 2) return null;

            const allMust = needs.every((need) => need.importance === "essential");
            const crowd = needs.length >= CROWDED;

            return {
                id,
                ask: crowd
                    ? `That's ${needs.length} things at “${IMPORTANCE_LABEL[needs[0]!.importance]}”, so each counts for only a little. Which of them matter most?`
                    : allMust
                      ? "You've made these all must-haves. If the cars can't give you all of them, which wins?"
                      : "If the cars can't give you everything, which of these matters most?",
                why: crowd ? "Pick up to three. They'll count a step more than the rest, which stay as they are." : WHY.focus,
                multiple: crowd,
                max: crowd ? PICK_UP_TO : undefined,
                /* "&" on a chip, where space is short; the reader's words keep "and". */
                choices: needs.map((need) => ({ id: need.id, label: need.label.replace(/ and /g, " & "), said: `${need.label} matters most.` })),
                none: "They matter equally",
            };
        }

        case "start":
            return {
                id,
                ask: "What would you like to do?",
                multiple: false,
                choices: [
                    { id: "judge", label: "Judge the cars here", said: "Judge the cars here with my settings." },
                    { id: "change", label: "Change something", said: "I'd like to change something for this chat." },
                    { id: "scratch", label: "Start from scratch", said: "Let's start from scratch." },
                ],
            };

        case "changeHow":
            return {
                id,
                ask: "Would you like to change all your answers, or only some of them?",
                why: "All goes through every question again, with what you said last time already picked. Some asks only the ones you choose.",
                multiple: false,
                choices: [
                    { id: "all", label: "Change all my answers", said: "All of them." },
                    { id: "some", label: "Change some of my answers", said: "Just some of them." },
                ],
                none: "Never mind",
            };

        case "changeWhich":
            return {
                id,
                ask: "Which answers would you like to change?",
                why: "I'll ask only those again, with what you said last time already picked. Tap the “i” to see what each is now.",
                multiple: true,
                /* Only questions this page would ask: a rule nothing here splits on isn't one to change. */
                choices: CHANGEABLE.filter((step) => stepFor(step, cars, u)).map((step) => ({
                    id: step,
                    label: CHANGE_LABEL[step]!,
                    said: CHANGE_LABEL[step]!,
                    description: `Now: ${nowSaid(step, u, cars)}.`,
                })),
                none: "Never mind",
            };

        case "keep":
        case "offers":
            return null;
    }

    if (id.startsWith("follow-")) {
        const followUp = followUpFor(id.slice("follow-".length));
        const need = u.needs.find((item) => item.id === `life-${followUp?.need}` && item.status === "active");

        if (!followUp || !need) return null;

        return {
            id,
            ask: followUp.ask,
            why: followUp.why,
            multiple: followUp.multiple ?? false,
            max: followUp.max,
            choices: followUp.choices.map(({ id: choice, label, said }) => ({ id: choice, label, said })),
            none: followUp.multiple ? "None of these" : undefined,
            followUp,
        };
    }

    if (id.startsWith("check-passengers-")) {
        const typed = Number(id.slice("check-passengers-".length));
        const said = u.passengers ?? 0;
        const count = stepFor("life-passengers", cars, u);

        if (!count?.guide || !Number.isFinite(typed)) return null;

        const keep = new Set([`passengers-${said}`, `passengers-${Math.min(typed, 5)}`]);
        const needs =
            seatStep(typed) === 3
                ? `with you that's ${inWords(typed + 1)} people, so the car needs six or more seats`
                : seatStep(typed) === 2
                  ? "with you that's five people, so the car needs five seats"
                  : "so someone sits in the back, and rear doors count";

        return {
            ...count,
            id,
            ask: `You said ${said ? `${inWords(said)} ${said === 1 ? "passenger" : "passengers"}` : "it's just you"}, but what you typed sounds like ${inWords(typed)} — ${needs}. Which is right?`,
            why: "The number of passengers decides which seats and doors I check.",
            choices: count.choices.filter((choice) => keep.has(choice.id)).map((choice) => ({ ...choice, label: `${choice.label} ${choice.label === "1" ? "passenger" : "passengers"}` })),
            /* "Just me" stays an answer only if it's what they said. */
            none: said ? undefined : count.none,
            custom: undefined,
            guide: { ...count.guide, choices: count.guide.choices.filter((choice) => keep.has(choice.id)) },
        };
    }

    if (id.startsWith("offer-")) {
        const [evidence, needId] = id.slice("offer-".length).split("|") as [EvidenceId, string];
        const need = u.needs.find((item) => item.id === needId);
        const def = EVIDENCE[evidence];

        if (!need || !def) return null;

        const counts = coverage(cars, evidence);
        const without = counts.total - counts.listed;
        /* Why this equipment is offered for this need — never just what it is. */
        const why = offerReason(need.id, evidence);

        return {
            id,
            ask: `Worth a look: ${lower(def.label)}. Should I count it?`,
            why: `You mentioned ${lower(need.label)}. ${def.label}: ${explain(evidence, why)}. ${counts.listed} of the ${counts.total} cars here list it and ${without} don't, so counting it would favour the ${counts.listed}.`,
            multiple: false,
            choices: [
                { id: "yes", label: "Yes, count it", said: `Yes, count ${lower(def.label)}.` },
                { id: "no", label: "No, leave it out", said: `No, leave ${lower(def.label)} out.` },
            ],
            offer: { id: evidence, needId },
        };
    }

    if (id.startsWith("life-")) {
        const group = id.slice("life-".length) as NeedGroup;
        const life = guideSteps(cars).find((item) => item.id === "life");
        const words = GROUP_ASK[group];
        const own = life?.choices.filter((choice) => choice.group === group) ?? [];
        const { choices, ...ask } =
            group === "people"
                ? whoRides(own, u.passengers ?? null)
                : { choices: own, ask: words?.ask ?? "", none: words?.none, multiple: group !== "passengers", exclusive: undefined };

        if (!life || !choices.length || !words) return null;

        /* The guide's own step, narrowed to this group, so answering it replaces this group's answers only. */
        return {
            ...fromGuide({ ...life, choices, multiple: ask.multiple }),
            id,
            ask: ask.ask,
            why: words.why,
            none: ask.none,
            max: words.max,
            exclusive: ask.exclusive,
            /* The count needs no words: the numbers cover it, and who they are comes next. */
            custom: group === "passengers" ? undefined : { kind: "text", label: "Something else…", placeholder: words.placeholder },
        };
    }

    const step = guideSteps(cars).find((item) => item.id === id);

    if (!step || !step.choices.length || step.id === "life") return null;

    const chat = fromGuide(step);

    if (step.id === "rules") {
        return {
            ...chat,
            /* Electric only and not electric together would rule out every car. */
            exclusive: [["electric-only", "not-electric"]],
            custom: { kind: "text", label: "Something else…", placeholder: "e.g. “no seven-seaters”" },
        };
    }

    return { ...chat, why: WHY.distance, custom: { kind: "km", label: "Another distance", placeholder: "km a month, e.g. 1,200", min: 50, max: 10000 } };
}

/** What the reader said last time, so changing an answer starts from it. */
export function selectedFor(step: ChatStep, u: Understanding, picks: Record<string, string[]> = {}): string[] {
    const valid = (ids: string[]) => ids.filter((id) => step.choices.some((choice) => choice.id === id));

    if (step.guide && (step.guide.id === "life" || step.guide.id === "rules")) {
        const owned = new Set(u.needs.filter((need) => need.status === "active").map((need) => need.id));
        /* Answers that add nothing to check leave no need behind: the count, and an adult beside the driver. */
        const tapped = new Set(picks[step.id] ?? []);

        return step.choices
            .filter((choice) => owned.has(`${step.guide!.id}-${choice.id}`) || choice.id === `passengers-${u.passengers}` || (choice.looksFor === undefined && tapped.has(choice.id)))
            .map((choice) => choice.id);
    }

    if (step.id === "focus") return valid(u.needs.filter((need) => need.status === "active" && need.importance === "essential").map((need) => need.id)).slice(0, step.max ?? 1);

    if (picks[step.id]) return valid(picks[step.id]!);

    if (step.id === "budget" && u.budget) return valid([`budget-${u.budget.monthly}`]);

    if (step.id === "distance" && u.monthlyKm) {
        const match = step.guide?.choices.find((choice) => choice.monthlyKm === u.monthlyKm!.value);
        return match ? [match.id] : [];
    }

    return [];
}

/** Whether the reader has already answered `id`, in taps or in their own words. */
export function answered(id: StepId, u: Understanding): boolean {
    const waived = u.waived ?? [];

    switch (id) {
        case "budget":
            return u.budget != null || waived.includes("budget");
        case "period":
            return u.rental != null || waived.includes("rental");
        case "distance":
            return u.monthlyKm != null;
        case "life":
            return lifeNeeds(u).length > 0;
        default:
            return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Saying it back                                                             */
/* -------------------------------------------------------------------------- */

/** What Lens says to a group none of whose needs apply. */
const NOTHING_HERE: Record<NeedGroup, string> = {
    passengers: "Just you — I won't add anything for passengers.",
    people: "Fine — I'll go by the number of seats alone.",
    driving: "None of these — I won't add anything for how you drive.",
    parking: "Fine — I won't add anything for parking.",
    weather: "Nothing unusual — I won't add anything for the weather.",
    loads: "Nothing much — I won't add anything for loads.",
    you: "Nothing else — I won't add anything more.",
};

/** What Lens says to one group of needs: what it heard — its own picks, and anything typed alongside them. */
function acknowledgeGroup(step: ChatStep, u: Understanding, chosen: string[], before: Set<string>): string {
    const own = new Set(step.choices.map((choice) => `life-${choice.id}`));
    /* This question's own answers first, then anything the words added beside them. */
    const needs = [
        ...lifeNeeds(u).filter((need) => own.has(need.id)),
        ...lifeNeeds(u).filter((need) => !own.has(need.id) && !need.id.startsWith("life-") && !before.has(need.id)),
    ];
    /* An answer that adds nothing to check says so in its own words: "One passenger can sit beside you…". */
    const nothingToCheck = step.choices
        /* No need at all — not a need judged on a figure, like emissions, whose list is simply empty. */
        .filter((choice) => chosen.includes(choice.id) && choice.looksFor === undefined && choice.description)
        .map((choice) => choice.description!);

    if (!needs.length) {
        if (nothingToCheck.length) return nothingToCheck.join(" ");
        if (step.none === "No pets") return "No pets — nothing to add for them.";

        return NOTHING_HERE[(step.id.startsWith("check-") ? "passengers" : step.id.slice("life-".length)) as NeedGroup] ?? "Noted.";
    }

    /* A few from each need in turn, so "things like" isn't four things for the first need alone. */
    const lists = needs.map((need) => labelsOf(checked(need, u)));
    const looks = [...new Set(Array.from({ length: Math.max(0, ...lists.map((list) => list.length)) }, (_, index) => lists.map((list) => list[index])).flat().filter((label): label is string => Boolean(label)))].slice(0, 4);
    const heard = looks.length
        ? `Got it — ${joined(needs.map((need) => lower(need.label)))}. For ${needs.length === 1 ? "that" : "those"} I'll check things like ${joined(looks.map(lower))}.`
        : `Got it — ${joined(needs.map((need) => lower(need.label)))}.`;

    return [heard, ...nothingToCheck].join(" ");
}

/** What Lens says after an answer: that it heard, and what it will do with it. */
export function acknowledge(step: ChatStep, u: Understanding, chosen: string[] = [], before: Set<string> = new Set()): string {
    if (step.followUp) {
        const picked = step.followUp.choices.filter((choice) => chosen.includes(choice.id));

        if (!picked.length) return "Fine — I'll keep it as it was.";
        if (!step.followUp.multiple) return picked.map((choice) => choice.reply).join(" ");

        /* The equipment itself, listed once: three replies joined with "and" read "…sensors, blind spot warning and lane keeping assist and a reversing camera…". */
        const counted = [...new Set(picked.flatMap((choice) => (choice.add ?? []).map((add) => lower(EVIDENCE[add.id].label))))];

        return `Got it — I'll ${step.followUp.replace ? "" : "also "}count ${joined(counted)}.`;
    }

    if (step.offer) {
        return chosen.includes("yes")
            ? `Counting it — ${lower(EVIDENCE[step.offer.id].label)} now weighs in.`
            : "Fine, I'll leave it out and won't offer it again.";
    }

    if (step.id.startsWith("life-") || step.id.startsWith("check-passengers-")) return acknowledgeGroup(step, u, chosen, before);

    switch (step.id) {
        case "focus": {
            const top = u.needs.find((need) => chosen.includes(need.id));
            /* The needs' own names, not the chips': "&" is for chips, not sentences. */
            const others = u.needs.filter((need) => step.choices.some((choice) => choice.id === need.id) && !chosen.includes(need.id)).map((need) => lower(need.label));

            if (step.multiple && top) {
                const picked = u.needs.filter((need) => chosen.includes(need.id)).map((need) => need.label);

                return `${joined(picked.map((label, index) => (index ? lower(label) : label)))} now ${picked.length === 1 ? "counts" : "count"} a step above the other ${others.length}.`;
            }

            return top
                ? `${top.label} now counts most in the ranking. ${joined(others).replace(/^./, (c) => c.toUpperCase())} ${others.length === 1 ? "counts" : "count"} one step less.`
                : "Equal it is — none of them outranks the others.";
        }
        case "rules": {
            const rules = ruledOut(u);

            if (!rules.length) return "Good — nothing's off the table.";

            /* "Any SUV, and any car that isn't an automatic" — not "anything that isn't an automatic and an SUV". */
            const parts = rules.map((rule) => (rule.mode === "without" ? asPhrase(rule.id).replace(/^an? /, "any ") : `any car that isn't ${asPhrase(rule.id)}`));

            return `Noted. Before judging, I'll set aside ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}` : parts[0]}.`;
        }
        case "budget":
            return u.budget
                ? `${formatEUR(u.budget.monthly)} a month, all in. Cars over it won't be my pick.`
                : "No limit, then. I'll still tell you what each car costs.";
        case "period":
            return u.rental
                ? `${monthLabel(u.rental.from)} to ${monthLabel(u.rental.to)}. I'll price each car on the FINN term that covers it.`
                : "Fine — I'll use each car's price on FINN's default term.";
        case "distance":
            return u.monthlyKm
                ? u.monthlyKm.value > FINN_INCLUDED_MONTHLY_KM
                    ? `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month. That's more than the ${FINN_INCLUDED_MONTHLY_KM.toLocaleString("en-GB")} km FINN's price includes, so I'll add the price of the mileage package each car needs for it.`
                    : `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month — that goes into each car's running cost.`
                : `Then I'll assume about ${BASE_ANSWERS.preferences.monthlyKm.toLocaleString("en-GB")} km a month for fuel and mileage costs.`;
        default:
            return "";
    }
}

/** The reader's rules in a line: "Automatic only and no SUV". */
function rulesText(u: Understanding): string {
    const rules = ruledOut(u);

    return rules.length
        ? joined(rules.map((rule) => `${rule.mode === "without" ? "no " : ""}${asPhrase(rule.id).replace(/^an? /, "")}${rule.mode === "must" ? " only" : ""}`)).replace(/^./, (c) => c.toUpperCase())
        : "None";
}

/** What Lens will judge by, as the calibration card shows it. */
export function summaryOf(u: Understanding, id: string = messageId()): Extract<ChatMessage, { kind: "summary" }> {
    const needs = lifeNeeds(u);
    const rules = ruledOut(u);
    const lines: { label: string; value: string; step?: StepId }[] = [];
    const rank: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };

    if (!needs.length) lines.push({ label: "The car has to", value: "Nothing in particular", step: "life" });

    lines.push({ label: "Rules", value: rulesText(u), step: "rules" });
    lines.push({ label: "Monthly limit", value: u.budget ? `${formatEUR(u.budget.monthly)} all in` : "No fixed limit", step: "budget" });
    lines.push({ label: "For", value: u.rental ? `${monthLabel(u.rental.from)} – ${monthLabel(u.rental.to)}` : "Not set", step: "period" });
    lines.push({
        label: "Driving",
        value: u.monthlyKm
            ? `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month`
            : `About ${BASE_ANSWERS.preferences.monthlyKm.toLocaleString("en-GB")} km a month (assumed — you didn't say)`,
        step: "distance",
    });

    const translation = chatAnswers(u);
    /* Each item once, under the first need to name it: blind spot warning under "Driving nerves" and again under "Safety" read as two things. */
    const seen = new Set<string>();

    return {
        id,
        at: now(),
        from: "lens",
        kind: "summary",
        needs: [...needs]
            .sort((a, b) => rank[a.importance] - rank[b.importance])
            .map((need) => {
                /* A need judged on a figure has no equipment to name, but it isn't looking at nothing. */
                const all = need.evidence.length ? labelsOf(checked(need, u)) : need.priorities.includes("environmental") ? ["Each car's CO₂ per km"] : [];
                const looksFor = all.filter((label) => !seen.has(label));

                all.forEach((label) => seen.add(label));

                return { id: need.id, label: need.label, importance: need.importance, looksFor, also: all.length - looksFor.length };
            }),
        lines,
        /* Which needs put weight on each priority, so a share can be traced back to what was said. */
        priorities: translation.profile.priorities.map((item) => ({ label: item.label, share: item.sharePercent, from: item.from })),
    };
}

/** A name for the chat the reader will recognise in a list. */
export function titleFor(u: Understanding): string {
    const needs = lifeNeeds(u).map((need) => need.label);

    if (needs.length) return needs.slice(0, 2).join(" · ");
    if (u.budget) return `Up to ${formatEUR(u.budget.monthly)} a month`;

    return "New chat";
}

/* -------------------------------------------------------------------------- */
/* Moving the conversation on                                                 */
/* -------------------------------------------------------------------------- */

const touch = (chat: Chat, messages: ChatMessage[], patch: Partial<Chat> = {}): Chat => {
    const next = { ...chat, ...patch, messages: [...chat.messages, ...messages], updatedAt: now() };

    return { ...next, title: titleFor(next.understanding) };
};

/** Retires every question still open: a new one, or a typed answer, supersedes them. */
const closeAsks = (messages: ChatMessage[]): ChatMessage[] =>
    messages.map((message) => (message.kind === "ask" && !message.answered ? { ...message, answered: true } : message));

const KEEP: ChatStep = {
    id: "keep",
    ask: "Shall I keep these as your settings, so every new chat starts from them? Or use them just for this chat?",
    why: "Saved settings are what new chats start from — you can still change anything in any chat, and in Settings you can see or forget them.",
    multiple: false,
    choices: [
        { id: "keep-settings", label: "Save as my settings", said: "Save these as my settings." },
        { id: "keep-chat", label: "Just for this chat", said: "Just for this chat." },
    ],
};

const NO_NEEDS: ChatStep = {
    id: "noNeeds",
    ask: "Want to name something the car has to do?",
    why: "Everything I judge comes from what you name: the equipment a need points me at, or a car's CO₂. With nothing named, I have nothing to judge fit on.",
    multiple: false,
    choices: [{ id: "add", label: "Pick something", said: "Let me pick something." }],
    custom: { kind: "text", label: "Say it in my own words…", placeholder: "e.g. “long drives with two kids”" },
};

/**
 * Asks the next question still worth asking, or — when there are none —
 * says back what Lens will judge by and asks whether to keep it.
 */
export function askNext(chat: Chat, cars: FinnCar[]): Chat {
    const preselect = chat.revising;
    const u = chat.understanding;
    let queue = [...chat.queue];

    while (queue.length) {
        const id = queue.shift()!;

        /*
         * The needs, reached: one short question per group of them. Skipped
         * whole when the reader has already said what the car has to do in
         * their own words — asking five more questions would be asking them
         * to repeat themselves.
         */
        if (id === "life") {
            if (!preselect && answered("life", u)) continue;

            queue = [...(Object.keys(NEED_GROUPS) as NeedGroup[]).map((group) => `life-${group}` as StepId), ...queue];
            continue;
        }

        /* Equipment worth a look, reached: one question each, from what the cars here differ on. */
        if (id === "offers") {
            const offers = worthALook(u, cars, (id) => coverage(cars, id), MAX_OFFERS).map((offer) => `offer-${offer.id}|${offer.needId}` as StepId);
            queue = [...offers, ...queue];
            continue;
        }

        /* Already said in their own words: asking would be asking them to repeat themselves. */
        if (!preselect && answered(id, u)) continue;

        const step = stepFor(id, cars, u);
        if (!step) continue;

        const ask: ChatMessage = {
            id: messageId(),
            at: now(),
            from: "lens",
            kind: "ask",
            /* A need already given — typed earlier, or kept from last time — shows as picked, so answering doesn't undo it. */
            step: preselect || id.startsWith("life-") ? { ...step, selected: selectedFor(step, u, chat.picks) } : step,
            answered: false,
        };

        return touch({ ...chat, messages: closeAsks(chat.messages) }, [ask], { queue, phase: "asking" });
    }

    /*
     * Nothing named that the car has to do: there's nothing to judge fit on.
     * The engine would fall back on its own default order and then tell the
     * reader "you put safety first" — so Lens says so and asks, instead.
     */
    if (!lifeNeeds(u).length) {
        return touch(
            { ...chat, messages: closeAsks(chat.messages) },
            [
                lens(
                    "You haven't named anything the car has to do, so I have nothing to judge how well each car fits you — only what it costs. For cost alone, FINN's own list and its price filter are the better tool.",
                ),
                { id: messageId(), at: now(), from: "lens", kind: "ask", step: NO_NEEDS, answered: false },
            ],
            { queue: [], phase: "asking" },
        );
    }

    return touch(
        { ...chat, messages: closeAsks(chat.messages) },
        [
            lens("Here's what I'll judge the cars by. Change anything that isn't right — tap an importance to set it, or “Change” beside a line."),
            summaryOf(u),
            { id: messageId(), at: now(), from: "lens", kind: "ask", step: KEEP, answered: false },
        ],
        { queue: [], phase: "keep", revising: false },
    );
}

/** A brand-new chat, from nothing or from the reader's saved settings. */
export function startChat(settings: SavedSettings | null, cars: FinnCar[], today = new Date()): Chat {
    const at = today.toISOString();
    const base: Chat = {
        id: newChatId(),
        title: "New chat",
        createdAt: at,
        updatedAt: at,
        messages: [],
        understanding: EMPTY_UNDERSTANDING,
        queue: [...STEP_ORDER],
        phase: "asking",
        kept: null,
        revising: false,
        picks: {},
        judgement: null,
    };

    if (!settings) {
        return askNext(
            touch(base, [
                lens("Hi, I'm Lens. I help you choose between the cars on finn.com."),
                lens(
                    "Here's how it works: I'll ask about how you'll use the car — tap an answer, or say it in your own words. Each question tells you why I'm asking. Then I'll judge the cars on this page against what you told me: every car gets a chip saying how well it fits you, and my top pick gets a trophy. Tap any chip to see why.",
                ),
                lens("Let's start."),
            ]),
            cars,
        );
    }

    const understanding = settings.rentalMonths
        ? rentalFor(settings.understanding, settings.rentalMonths, settings.understanding.rental?.said ?? "", today)
        : settings.understanding;

    const start = stepFor("start", cars)!;

    return touch({ ...base, understanding, queue: [], phase: "ready", kept: "settings", picks: settings.picks ?? {} }, [
        lens("Welcome back! I'll start from your saved settings:"),
        summaryOf(understanding),
        { id: messageId(), at: now(), from: "lens", kind: "ask", step: start, answered: false },
    ]);
}

/** Something the reader typed as their own answer, already read by Lens's reader. */
export interface Heard {
    text: string;
    understanding: Understanding;
    reply: string;
}

/**
 * The reader answered the question in `askId`: taps, a number of their own,
 * or words Lens's reader has already read (`heard`).
 *
 * Returns the chat moved on, and what the chat page has to do `after`:
 * nothing, or judge the cars. (Not `then`: an object with a `then` is a
 * promise to anything that awaits it.)
 */
export function answer(
    chat: Chat,
    askId: string,
    chosen: string[],
    cars: FinnCar[],
    today = new Date(),
    extra: { amount?: number; heard?: Heard } = {},
): { chat: Chat; after: "wait" | "judge" } {
    const ask = chat.messages.find((message) => message.id === askId);

    if (!ask || ask.kind !== "ask" || ask.answered) return { chat, after: "wait" };

    const step = ask.step;

    /* The limits hold whatever sends the answer: the page, a test, a chat saved before them. */
    chosen = withinLimits(step, chosen);
    const picked = step.choices.filter((choice) => chosen.includes(choice.id));
    const tapped = picked.length ? picked.map((choice) => choice.said).join(" ") : "";
    const messages = closeAsks(chat.messages);
    const base: Chat = { ...chat, messages, picks: { ...(chat.picks ?? {}), [step.id]: chosen } };

    /* -- The start of a chat from saved settings ------------------------- */
    if (step.id === "start") {
        const said = tapped;

        if (picked[0]?.id === "judge") return { chat: touch(base, [reader(said)], { phase: "ready" }), after: "judge" };

        /* "Change something" is some of it: which part is the question. */
        if (picked[0]?.id === "change") return { chat: askNext(touch(base, [reader(said)], { queue: ["changeWhich"], kept: null }), cars), after: "wait" };

        if (picked[0]?.id === "scratch") {
            const next = touch(base, [reader(said), lens("Starting fresh — your saved settings stay as they are.")], {
                understanding: EMPTY_UNDERSTANDING,
                queue: [...STEP_ORDER],
                kept: null,
                picks: {},
            });

            return { chat: askNext(next, cars), after: "wait" };
        }

        return { chat, after: "wait" };
    }

    /* -- Nothing named yet: back to the needs ---------------------------- */
    if (step.id === "noNeeds") {
        if (extra.heard) {
            const next = touch(base, [reader(extra.heard.text), lens(extra.heard.reply || "Got it.")], { understanding: extra.heard.understanding, queue: [] });
            return { chat: askNext(next, cars), after: "wait" };
        }

        const next = touch(base, [reader(tapped || "Let me pick something."), lens("Here they are again.")], { queue: ["life"], revising: true });
        return { chat: askNext(next, cars), after: "wait" };
    }

    /* -- Changing answers: all of them, or which ------------------------- */
    if (step.id === "changeHow" || step.id === "changeWhich") {
        const said = step.multiple ? (picked.length ? `I'd like to change: ${joined(picked.map((choice, index) => (index ? lowerFirst(choice.label) : choice.label)))}.` : "Never mind.") : tapped || "Never mind.";

        if (!picked.length) {
            /* Nothing to change: back to where the chat was. */
            return { chat: touch(base, [reader(said), lens("Fine — I'll keep everything as it is.")], { queue: [], phase: chat.judgement ? "judged" : "ready" }), after: "wait" };
        }

        if (step.id === "changeHow" && picked[0]!.id === "all") {
            const next = touch(base, [reader(said), lens("Sure. Here are my questions again, with what you said last time already picked.")], {
                queue: [...STEP_ORDER],
                kept: null,
                revising: true,
            });

            return { chat: askNext(next, cars), after: "wait" };
        }

        if (step.id === "changeHow") return { chat: askNext(touch(base, [reader(said)], { queue: ["changeWhich"] }), cars), after: "wait" };

        /* The picked questions in the order they're asked, and which-matters-most again when a need changed. */
        const picks = CHANGEABLE.filter((id) => chosen.includes(id));
        const queue = picks.some((id) => id.startsWith("life-")) ? [...picks.filter((id) => id.startsWith("life-")), "focus" as StepId, ...picks.filter((id) => !id.startsWith("life-"))] : picks;
        const next = touch(base, [reader(said), lens(picks.length === 1 ? "Sure — here it is again." : "Sure — just those, with what you said last time already picked.")], {
            queue,
            kept: null,
            revising: true,
        });

        return { chat: askNext(next, cars), after: "wait" };
    }

    /* -- Keep as settings, or this chat only ----------------------------- */
    if (step.id === "keep") {
        if (!picked[0]) return { chat, after: "wait" };

        const kept = picked[0].id === "keep-settings" ? "settings" : "chat";

        return {
            chat: touch(
                base,
                [
                    reader(tapped),
                    lens(
                        kept === "settings"
                            ? "Saved. New chats will start from these — you can see or forget them in Settings, and change them in any chat."
                            : "Okay — just this chat. Your saved settings, if you have any, stay as they are.",
                    ),
                ],
                { kept, phase: "ready" },
            ),
            after: "judge",
        };
    }

    /* -- One of the questions -------------------------------------------- */
    let understanding = extra.heard?.understanding ?? chat.understanding;
    /* Their words as they'd end a sentence, beside the taps' own. */
    const typed = extra.heard?.text ? extra.heard.text.replace(/([^.!?…])$/, "$1.") : "";
    let said = [tapped, typed].filter(Boolean).join(" ");
    let queue = base.queue;

    if (step.followUp) {
        understanding = applyFollowUp(understanding, step.followUp, chosen);
    } else if (step.offer) {
        understanding = chosen.includes("yes")
            ? withSuggestion(understanding, step.offer.id, explain(step.offer.id, offerReason(step.offer.needId, step.offer.id)), step.offer.needId)
            : withoutSuggestion(understanding, step.offer.id);
    } else if (step.id === "focus" && chosen.length) {
        /*
         * The one they chose ends up one step above the others it tied with —
         * one step, as the question says. Raising the choice and lowering
         * the rest as well put "safety above all" two steps over a nervous
         * driver's needs, which fell to nice-to-have.
         */
        const tied = new Set(step.choices.map((choice) => choice.id));
        const up: Record<NeedImportance, NeedImportance> = { niceToHave: "important", important: "essential", essential: "essential" };

        /* Several picked: one sentence, not "…matters most." three times. */
        if (step.multiple) {
            const labels = understanding.needs.filter((need) => chosen.includes(need.id)).map((need) => lower(need.label));
            said = `These matter most: ${joined(labels)}.`;
        }

        understanding = {
            ...understanding,
            needs: understanding.needs.map((need) => {
                if (!tied.has(need.id)) return need;
                if (chosen.includes(need.id)) return { ...need, importance: up[need.importance] };

                /* Already at the top, the choice can't rise: the others step down instead. */
                return need.importance === "essential" ? { ...need, importance: "important" as const } : need;
            }),
        };
    } else if (step.guide) {
        /* Words typed here that mean one of this question's own answers — "a big dog" for Pets — count as tapping it. */
        const owns = (choice: { id: string }, u: Understanding) => u.needs.some((need) => need.id === `${step.guide!.id}-${choice.id}`);
        const typedHere = extra.heard ? step.choices.filter((choice) => owns(choice, extra.heard!.understanding) && !owns(choice, chat.understanding)).map((choice) => choice.id) : [];

        chosen = [...new Set([...chosen, ...typedHere])];
        understanding = applyChoices(understanding, step.guide, chosen);

        if (step.id.startsWith("life-")) {
            /* The second question about each need where it changes something, straight after its group. */
            const follow = chosen.filter((id) => followUpFor(id)).map((id) => `follow-${id}` as StepId);
            queue = [...follow, ...queue.filter((id) => !follow.includes(id))];

            /* More people typed than counted, enough to change the seats: that comes first. */
            const check = step.id === "life-people" && extra.heard ? seatCheck(extra.heard.text, understanding.passengers ?? null) : null;
            if (check) queue = [check, ...queue];
        }

        if (step.id === "distance" && extra.amount != null) {
            understanding = { ...understanding, monthlyKm: { value: Math.round(extra.amount), said: `About ${Math.round(extra.amount).toLocaleString("en-GB")} km a month.` } };
            said = `About ${Math.round(extra.amount).toLocaleString("en-GB")} km a month.`;
        }
    } else if (step.id === "budget") {
        const amount = extra.amount ?? (picked[0] ? Number(picked[0].id.replace("budget-", "")) : null);

        if (extra.amount != null) said = `Up to ${formatEUR(extra.amount)} a month.`;
        understanding = amount ? withBudget(understanding, Math.round(amount), said) : waiveEssential(understanding, "budget");
    } else if (step.id === "period") {
        const months = extra.amount ?? (picked[0] ? Number(picked[0].id.replace("period-", "")) : null);

        if (extra.amount != null) said = `I need it for about ${Math.round(extra.amount)} months.`;
        understanding = months ? rentalFor(understanding, Math.round(months), said, today) : waiveEssential(understanding, "rental");
    }

    /* Nothing tapped: the reader said this question's own "none" — "Just me", "Nothing much" — not the guide's. */
    if (!said) said = chosen.length && step.guide ? saidFor(step.guide, chosen) : (step.none ?? "");

    const before = new Set(chat.understanding.needs.map((need) => need.id));
    const reply = [extra.heard?.reply, acknowledge(step, understanding, chosen, before)].filter(Boolean).join(" ");
    const next = touch(base, [reader(said), lens(reply)], { understanding, queue });

    return { chat: askNext(next, cars), after: "wait" };
}

/** The reader wants to change what they said, after a judgement. */
/** The reader wants to change what they said: all of it, or which parts is asked next. */
export function changeAnswers(chat: Chat, cars: FinnCar[]): Chat {
    const next = touch({ ...chat, messages: closeAsks(chat.messages) }, [reader("I'd like to change my answers.")], { queue: ["changeHow"] });

    return askNext(next, cars);
}

const CHANGE_WHAT: Partial<Record<StepId, string>> = {
    life: "what the car has to do",
    rules: "my rules",
    budget: "my monthly limit",
    period: "how long I need it",
    distance: "how far I drive",
};

/** One answer, changed from the summary: that question again, then back to the summary. */
export function changeOne(chat: Chat, step: StepId, cars: FinnCar[]): Chat {
    const next = touch({ ...chat, messages: closeAsks(chat.messages) }, [
        reader(`I'd like to change ${CHANGE_WHAT[step] ?? "that"}.`),
    ], { queue: [step, ...(step === "life" ? (["focus"] as StepId[]) : [])], kept: null, revising: true });

    return askNext(next, cars);
}

/**
 * How much one need counts, set from the summary. The summary on screen is
 * redrawn in place — it's the same card, now saying what the reader chose.
 */
export function setImportance(chat: Chat, needId: string, importance: NeedImportance): Chat {
    const understanding = {
        ...chat.understanding,
        needs: chat.understanding.needs.map((need) => (need.id === needId ? { ...need, importance } : need)),
    };

    const lastSummary = [...chat.messages].reverse().find((message) => message.kind === "summary");

    return {
        ...chat,
        understanding,
        updatedAt: now(),
        messages: chat.messages.map((message) => (message === lastSummary ? summaryOf(understanding, message.id) : message)),
    };
}

/** Adds what the reader typed, and Lens's reply, without moving the questions on. */
export function withExchange(chat: Chat, typed: string, reply: string | null, understanding: Understanding = chat.understanding): Chat {
    return touch(chat, [reader(typed), ...(reply ? [lens(reply)] : [])], { understanding });
}

/** Lens says something on its own. */
export function withLensSaying(chat: Chat, ...texts: string[]): Chat {
    return touch(chat, texts.filter(Boolean).map(lens));
}

/**
 * The rental period, as a length, for saving: dates said in September mean
 * something else by March.
 */
export function rentalMonths(u: Understanding): number | null {
    if (!u.rental) return null;

    const [fy, fm] = u.rental.from.split("-").map(Number) as [number, number];
    const [ty, tm] = u.rental.to.split("-").map(Number) as [number, number];

    return (ty - fy) * 12 + (tm - fm) + 1;
}
