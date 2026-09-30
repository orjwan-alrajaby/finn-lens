import { lowerFirst } from "@/lib/reasoning-engine/format";
import { formatEUR } from "@/lib/reasoning-engine";
import { CATEGORIES, CATEGORY_IDS, FINN_INCLUDED_MONTHLY_KM } from "@/lib/reasoning-engine/constants";
import type { CategoryId } from "@/lib/reasoning-engine/types";
import { addMonths, monthLabel, type MonthString } from "@/lib/reasoning-engine/contract";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import { asPhrase, barePhrase, coverage, EVIDENCE, isKind, type EvidenceId } from "@/lib/lens-chat/evidence";
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

import { ASK_LABEL, asksAt, depthOf, EXPLAIN_LABEL, FULL, type AskDepth, type Depth, type ExplainDepth } from "./depth";
import { applyFollowUp, followUpFor, offerReason, worthALook } from "./follow-ups";
import { BASE_ANSWERS, chatAnswers } from "./judge";
import { messageId, newChatId } from "./store";
import type { Chat, ChatMessage, ChatStep, Rewind, SavedSettings, StepId } from "./types";

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

/* -------------------------------------------------------------------------- */
/* The priorities, in the chat                                                */
/* -------------------------------------------------------------------------- */

/** The reader's priorities in the order Lens weighs them: their own order where they gave one, else their answers'. */
const orderOf = (u: Understanding): CategoryId[] => chatAnswers(u).answers.priorities;

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** A priority's name in a sentence: "city and parking", "safety and driver assistance". */
const priorityName = (id: CategoryId) => CATEGORIES[id].label.toLowerCase().replace(/ & /g, " and ");

const capital = (text: string) => text.replace(/^./, (c) => c.toUpperCase());

/** "Practicality first, then city and parking, then safety and driver assistance." */
const inOrder = (order: CategoryId[]) => [order[0] ? `${priorityName(order[0])} first` : "", ...order.slice(1).map(priorityName)].filter(Boolean).join(", then ");

/** A priority as a choice: its name, what the reader said that led to it, and what it's judged on. */
function priorityChoice(u: Understanding, said: (label: string) => string) {
    const from = new Map(chatAnswers(u).order.map((item) => [item.id, item.from]));

    return (id: CategoryId) => ({
        id,
        label: CATEGORIES[id].label,
        said: said(CATEGORIES[id].label),
        means: from.get(id)?.length ? `From what you said: ${joined([...new Set(from.get(id))].map((label) => lower(label)))}.` : "Nothing you said points here yet.",
        description: CATEGORIES[id].description,
    });
}

/** The understanding with the reader's own order of their priorities. */
const withOrder = (u: Understanding, order: CategoryId[]): Understanding => ({ ...u, lens: { ...u.lens, order } });

/** The questions, in the order Lens asks them. Follow-ups are slotted in behind "life". */
/* The limit before the rules: "nothing over €700" can only be offered once there's a €700. */
export const STEP_ORDER: StepId[] = ["askDepth", "explainDepth", "life", "priorities", "budget", "rules", "period", "distance", "offers"];

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
const CHANGEABLE: StepId[] = ["askDepth", "explainDepth", "priorities", "life-passengers", "life-people", "life-driving", "life-parking", "life-weather", "life-loads", "life-you", "life-co2", "life-efficiency", "budget", "rules", "period", "distance"];

const CHANGE_LABEL: Partial<Record<StepId, string>> = {
    askDepth: "How much I ask",
    explainDepth: "How much I explain",
    priorities: "Your priorities",
    "life-passengers": "How many ride with you",
    "life-people": "Who rides with you",
    "life-driving": "Your driving",
    "life-parking": "Where you park",
    "life-weather": "The weather",
    "life-loads": "What you carry or tow",
    "life-you": "Anything else",
    "life-co2": "CO₂ emissions",
    "life-efficiency": "Fuel or electricity use",
    rules: "Must-haves & must-nots",
    budget: "Monthly limit",
    period: "How long",
    distance: "How far you drive",
};

/** What a question's answer is now, in a few words: "€700 a month", "travelling with children and pets". */
function nowSaid(step: StepId, u: Understanding, cars: FinnCar[], depth: Depth = FULL): string {
    switch (step) {
        case "askDepth":
            return lowerFirst(ASK_LABEL[depth.ask]);
        case "explainDepth":
            return lowerFirst(EXPLAIN_LABEL[depth.explain]);
        case "priorities":
            return inOrder(orderOf(u)) || "none yet";
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

    /* How much CO₂ or consumption matters: the answer given, in its own words. */
    if (group === "co2" || group === "efficiency") {
        const answer = (guideSteps(cars).find((item) => item.id === "life")?.choices ?? []).find((choice) => choice.group === group && lifeNeeds(u).some((need) => need.id === `life-${choice.id}`));
        return answer ? lowerFirst(answer.label) : "not really";
    }

    const own = new Set((guideSteps(cars).find((item) => item.id === "life")?.choices ?? []).filter((choice) => choice.group === group).map((choice) => `life-${choice.id}`));
    const labels = lifeNeeds(u).filter((need) => own.has(need.id)).map((need) => lower(need.label));

    return labels.length ? joined(labels) : "nothing";
}

/**
 * Questions with one answer, and no words of the reader's own: a count, and
 * how much CO₂ or consumption matters. Their answers cover every case.
 */
const ONE_ANSWER = new Set<NeedGroup>(["passengers", "co2", "efficiency"]);


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
const GROUP_ASK: Record<NeedGroup, { ask: string; why: string; none: string; placeholder: string; max?: number; overlap?: number }> = {
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
        why: "Pick up to three that are a regular part of your driving. The “i” on an answer says what it means and what I'd check.",
        max: 3,
        /*
         * Stricter here than elsewhere: long motorway drives and road trips
         * share half of what Lens checks, and are the same kind of driving.
         * Elsewhere half is too little — children and pets share rear doors
         * and are still two different passengers.
         */
        overlap: 0.5,
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
    co2: {
        ask: "How much do the car's CO₂ emissions matter to you?",
        why: "I judge them on each car's official CO₂ per km — an electric car is zero at the tailpipe. That's what it emits while driving, not its whole environmental story, which isn't in FINN's data.",
        none: "Not really",
        placeholder: "",
    },
    efficiency: {
        ask: "How much does it matter that the car uses little fuel or electricity?",
        why: "I compare each car's consumption with others that run on the same thing — petrol with petrol, electric with electric. What it costs you to run is already in every car's monthly price.",
        none: "Not really",
        placeholder: "",
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
};

/** An answer this much of whose checks another picked answer already makes is set aside. */
const MOSTLY = 0.75;

/**
 * Which answers each one mostly covers: at least three quarters of what Lens
 * would check for the other is already on its own list. Worked out from the
 * equipment on these cars, so it holds for this page and says why.
 */
function coverageOf(choices: ChatStep["choices"], threshold = MOSTLY): ChatStep["covers"] {
    const covers: NonNullable<ChatStep["covers"]> = {};

    for (const picked of choices) {
        for (const other of choices) {
            if (other.id === picked.id || !picked.looksFor?.length || !other.looksFor?.length) continue;

            const shared = other.looksFor.filter((label) => picked.looksFor!.includes(label));

            if (shared.length / other.looksFor.length >= threshold) (covers[picked.id] ??= []).push({ id: other.id, shared });
        }
    }

    return Object.keys(covers).length ? covers : undefined;
}

/** The guide's step as the chat asks it; `overlap` is how much two answers may share before one is set aside. */
const fromGuide = (step: GuideStep, overlap = MOSTLY): ChatStep => {
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
        covers: step.multiple ? coverageOf(choices, overlap) : undefined,
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
export function stepFor(id: StepId, cars: FinnCar[], u: Understanding = EMPTY_UNDERSTANDING, depth: Depth = FULL): ChatStep | null {
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


        case "prioritiesConfirm": {
            const order = orderOf(u);
            if (order.length < 2) return null;

            return {
                id,
                ask: `From what you've told me, I'll weigh ${inOrder(order)}. Does that feel right?`,
                why: "Each priority counts a little less than the one before it. They come from your answers, and each is judged on all of its equipment.",
                multiple: false,
                choices: [
                    { id: "ok", label: "Looks right", said: "That looks right." },
                    { id: "order", label: "Let me put them in order", said: "I'd like to put them in order." },
                ],
            };
        }

        case "prioritiesPick": {
            const order = orderOf(u);
            /* Nothing proposed is nothing to settle: with no needs, the chat asks for one instead. */
            if (!order.length) return null;

            return {
                id,
                ask: "Your answers point to these priorities. Add or take out any, and then I'll ask you to put them in order.",
                why: "Each priority is judged on all of its equipment — the “i” says what that is. One you take out won't count at all.",
                multiple: true,
                choices: [...order, ...CATEGORY_IDS.filter((id) => !order.includes(id))].map(priorityChoice(u, (label) => label)),
            };
        }

        case "askDepth":
            return {
                id,
                ask: "First, how much should I ask you?",
                why: "It changes how many questions I ask, not how I judge the cars: every choice uses the same scoring. You can change it later.",
                multiple: false,
                choices: [
                    { id: "quick", label: "Quick", said: "Keep it quick.", description: "A handful of questions. I'll suggest what matters to you, and you confirm it." },
                    { id: "balanced", label: "Balanced", said: "Balanced, please.", description: "Enough questions to understand you properly, without an interrogation." },
                    { id: "thorough", label: "Thorough", said: "Be thorough.", description: "Every question, and you set how much each priority and each feature counts." },
                ],
            };

        case "explainDepth":
            return {
                id,
                ask: "And how much should I explain when I show you the cars?",
                why: "It changes how much I say about the result, not the result itself. You can always ask for more.",
                multiple: false,
                choices: [
                    { id: "quick", label: "Quick", said: "Just the essentials.", description: "My pick, and the few reasons that decided it." },
                    { id: "balanced", label: "Balanced", said: "A balance.", description: "My pick, why, and what you'd give up for it." },
                    { id: "detailed", label: "Detailed", said: "All the details.", description: "The full breakdown: your priorities, the features that counted, the evidence and the alternatives." },
                ],
            };

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
                    description: `Now: ${nowSaid(step, u, cars, depth)}.`,
                })),
                none: "Never mind",
            };

        case "keep":
        case "confirm":
        case "offers":
            return null;
    }

    /* Which matters most (balanced), or each place in turn. */
    if (id === "top" || id.startsWith("rank-")) {
        const n = id === "top" ? 1 : Number(id.slice("rank-".length));
        const order = orderOf(u);
        const remaining = order.slice(n - 1);

        if (!Number.isFinite(n) || remaining.length < 2) return null;

        return {
            id,
            ask: n === 1 ? "Which of these matters most to you?" : `And after ${priorityName(order[n - 2]!)}?`,
            why: n === 1 ? "Your first priority counts most, and each after it a little less." : "Each place counts a little less than the one before it.",
            multiple: false,
            choices: remaining.map(priorityChoice(u, (label) => (id === "top" ? `${label} matters most.` : `${label} ${ORDINALS[n - 1]}.`))),
            none: n === 1 ? "Keep the order you suggested" : "The rest as they are",
        };
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
                : { choices: own, ask: words?.ask ?? "", none: words?.none, multiple: !ONE_ANSWER.has(group), exclusive: undefined };

        if (!life || !choices.length || !words) return null;

        /* The guide's own step, narrowed to this group, so answering it replaces this group's answers only. */
        return {
            ...fromGuide({ ...life, choices, multiple: ask.multiple }, words.overlap),
            id,
            ask: ask.ask,
            why: words.why,
            none: ask.none,
            max: words.max,
            exclusive: ask.exclusive,
            /* The count needs no words: the numbers cover it, and who they are comes next. */
            custom: ONE_ANSWER.has(group) ? undefined : { kind: "text", label: "Something else…", placeholder: words.placeholder },
        };
    }

    const found = guideSteps(cars).find((item) => item.id === id);
    /* A limit the reader gave can be a rule too: cars over it set aside rather than graded. */
    const firm: GuideChoice[] =
        found?.id === "rules" && u.budget
            ? [
                  {
                      id: "firm-budget",
                      label: `Nothing over ${formatEUR(u.budget.monthly)}`,
                      said: `Nothing over ${formatEUR(u.budget.monthly)} a month, no exceptions.`,
                      description: "Cars over your limit are set aside rather than graded, so none of them comes up as a match.",
                  },
              ]
            : [];
    const step = found ? { ...found, choices: [...firm, ...found.choices] } : null;

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
export function selectedFor(step: ChatStep, u: Understanding, picks: Record<string, string[]> = {}, depth: Depth = FULL): string[] {
    /* The priorities the answers point to start picked: taking one out is the reader's choice. */
    if (step.id === "prioritiesPick") return orderOf(u);
    if (step.id === "askDepth") return [depth.ask];
    if (step.id === "explainDepth") return [depth.explain];

    const valid = (ids: string[]) => ids.filter((id) => step.choices.some((choice) => choice.id === id));

    if (step.guide && (step.guide.id === "life" || step.guide.id === "rules")) {
        const owned = new Set(u.needs.filter((need) => need.status === "active").map((need) => need.id));
        /* Answers that add nothing to check leave no need behind: the count, and an adult beside the driver. */
        const tapped = new Set(picks[step.id] ?? []);

        return step.choices
            .filter(
                (choice) =>
                    owned.has(`${step.guide!.id}-${choice.id}`) ||
                    choice.id === `passengers-${u.passengers}` ||
                    (choice.id === "firm-budget" && u.budget?.firm) ||
                    (choice.looksFor === undefined && tapped.has(choice.id)),
            )
            .map((choice) => choice.id);
    }


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
    co2: "Fine — CO₂ won't count.",
    efficiency: "Fine — consumption won't count. What each car costs to run is still in its price.",
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

    /* How much CO₂ or consumption matters: said as how much it will count. */
    const scale = step.id === "life-co2" || step.id === "life-efficiency";
    if (scale && needs[0]) {
        const counts = { essential: "a must-have", important: "important", niceToHave: "nice to have" }[needs[0].importance];
        return `${needs[0].label} will count as ${counts}.`;
    }

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

    if (step.id === "top" || step.id.startsWith("rank-")) {
        const n = step.id === "top" ? 1 : Number(step.id.slice("rank-".length));
        const order = orderOf(u);
        const pick = chosen[0] as CategoryId | undefined;

        if (!pick) return `Then that's the order: ${inOrder(order)}.`;
        if (step.id === "top") return `${capital(priorityName(pick))} first, then the rest as I had them.`;

        return order.length - n < 2 ? `So that's your order: ${inOrder(order)}.` : `${capital(priorityName(pick))} ${ORDINALS[n - 1]}.`;
    }

    switch (step.id) {
        case "prioritiesConfirm":
            return chosen.includes("order") ? "Sure — let's put them in order." : `Good — ${inOrder(orderOf(u))}.`;
        case "prioritiesPick":
            return orderOf(u).length > 1 ? "Got it. Now the order." : `Got it — I'll weigh ${priorityName(orderOf(u)[0]!)}.`;
        case "rules": {
            const rules = ruledOut(u);

            /* "Any SUV, and any car that isn't an automatic" — not "anything that isn't an automatic and an SUV". */
            const parts = [
                ...rules.map((rule) =>
                    rule.mode === "without"
                        ? asPhrase(rule.id).replace(/^an? /, "any ")
                        : isKind(rule.id)
                          ? `any car that isn't ${asPhrase(rule.id)}`
                          : `any car without ${asPhrase(rule.id)}`,
                ),
                ...(u.budget?.firm ? [`any car over ${formatEUR(u.budget.monthly)} a month`] : []),
            ];

            if (!parts.length) return "Good — nothing's off the table.";

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

    /* "No SUV", "automatic only", "must have rear doors": a kind of car is, anything else is had. */
    const said = rules.map((rule) =>
        rule.mode === "without"
            ? `no ${barePhrase(rule.id)}`
            : isKind(rule.id)
              ? `${barePhrase(rule.id)} only`
              : `must have ${asPhrase(rule.id)}`,
    );

    return said.length ? joined(said).replace(/^./, (c) => c.toUpperCase()) : "None";
}

/** What Lens will judge by, as the calibration card shows it. */
export function summaryOf(u: Understanding, id: string = messageId(), depth: Depth | null = null): Extract<ChatMessage, { kind: "summary" }> {
    const needs = lifeNeeds(u);
    const rules = ruledOut(u);
    const lines: { label: string; value: string; step?: StepId }[] = [];
    const rank: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };

    if (!needs.length) lines.push({ label: "The car has to", value: "Nothing in particular", step: "life" });

    lines.push({ label: "Rules", value: rulesText(u), step: "rules" });
    lines.push({ label: "Monthly limit", value: u.budget ? `${formatEUR(u.budget.monthly)} all in${u.budget.firm ? ", nothing over it" : ""}` : "No fixed limit", step: "budget" });
    lines.push({ label: "For", value: u.rental ? `${monthLabel(u.rental.from)} – ${monthLabel(u.rental.to)}` : "Not set", step: "period" });
    lines.push({
        label: "Driving",
        value: u.monthlyKm
            ? `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month`
            : `About ${BASE_ANSWERS.preferences.monthlyKm.toLocaleString("en-GB")} km a month (assumed — you didn't say)`,
        step: "distance",
    });

    const order = orderOf(u);
    if (order.length) lines.unshift({ label: "Priorities", value: order.map((id, index) => `${index + 1}. ${CATEGORIES[id].label}`).join(" · "), step: "priorities" });

    if (depth) {
        lines.push({ label: "Questions", value: ASK_LABEL[depth.ask], step: "askDepth" });
        lines.push({ label: "Explanations", value: EXPLAIN_LABEL[depth.explain], step: "explainDepth" });
    }

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
                const all = need.evidence.length
                    ? labelsOf(checked(need, u))
                    : need.priorities.includes("environmental")
                      ? ["Each car's CO₂ per km"]
                      : need.priorities.includes("efficiency")
                        ? ["Each car's consumption, against others of its kind"]
                        : [];
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

/*
 * A pause over the summary. Asking "keep these as your settings?" in the
 * same breath as showing them made answering it the moment the reader was
 * done looking — whether or not they were. This is that moment, said.
 */
const CONFIRM: ChatStep = {
    id: "confirm",
    ask: "Take your time. When it all looks right, carry on and I'll judge the cars.",
    why: "Nothing is saved or judged until you say so. Until then you can change any line above, or tap an importance.",
    multiple: false,
    choices: [{ id: "go", label: "Looks good to me — let's go", said: "Looks good — let's go." }],
};

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
            /* Only the groups this depth asks about. */
            if (!asksAt(depthOf(chat).ask, id)) continue;

            queue = [...(Object.keys(NEED_GROUPS) as NeedGroup[]).map((group) => `life-${group}` as StepId), ...queue];
            continue;
        }

        /*
         * The priorities, reached: confirmed as proposed when quick, the one
         * that matters most when balanced, added to, taken from and put in
         * order when thorough — or when the reader chose to change them.
         */
        if (id === "priorities") {
            const ask = depthOf(chat).ask;
            const full = ask === "thorough" || (chat.explicit ?? []).includes("priorities");

            queue = [full ? "prioritiesPick" : ask === "balanced" ? "top" : "prioritiesConfirm", ...queue];
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

        /* Not at this depth, unless the reader chose to answer it again. */
        if (!asksAt(depthOf(chat).ask, id) && !(chat.explicit ?? []).includes(id)) continue;

        const step = stepFor(id, cars, u, depthOf(chat));
        if (!step) continue;

        const ask: ChatMessage = {
            id: messageId(),
            at: now(),
            from: "lens",
            kind: "ask",
            /* A need already given — typed earlier, or kept from last time — shows as picked, so answering doesn't undo it. */
            step: preselect || id.startsWith("life-") || id === "prioritiesPick" ? { ...step, selected: selectedFor(step, u, chat.picks, depthOf(chat)) } : step,
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
            summaryOf(u, messageId(), chat.depth ?? null),
            { id: messageId(), at: now(), from: "lens", kind: "ask", step: CONFIRM, answered: false },
        ],
        { queue: [], phase: "keep", revising: false, explicit: [] },
    );
}

/**
 * A brand-new chat, from nothing or from the reader's saved settings. With
 * `depth` already known, Lens doesn't ask how much to ask and explain.
 */
export function startChat(settings: SavedSettings | null, cars: FinnCar[], today = new Date(), depth: Depth | null = null): Chat {
    const at = today.toISOString();
    const base: Chat = {
        id: newChatId(),
        title: "New chat",
        createdAt: at,
        updatedAt: at,
        messages: [],
        understanding: EMPTY_UNDERSTANDING,
        queue: depth ? STEP_ORDER.filter((id) => id !== "askDepth" && id !== "explainDepth") : [...STEP_ORDER],
        ...(depth ? { depth } : {}),
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

    return touch({ ...base, understanding, queue: [], phase: "ready", kept: "settings", picks: settings.picks ?? {}, depth: settings.depth }, [
        lens("Welcome back! I'll start from your saved settings:"),
        summaryOf(understanding, messageId(), settings.depth ?? null),
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
    const result = answerStep(chat, askId, chosen, cars, today, extra);
    const ask = chat.messages.find((message) => message.id === askId);

    if (result.chat === chat || ask?.kind !== "ask") return result;

    /* Keeping the answers ends the questions: from a judgement, "Change my answers" is the way back. */
    if (ask.step.id === "keep" || ask.step.id === "start") return { ...result, chat: { ...result.chat, history: [] } };

    const said = result.chat.messages[chat.messages.length];
    const before: Rewind = {
        askId,
        readerId: said?.from === "reader" ? said.id : null,
        chosen,
        messageCount: chat.messages.length,
        understanding: chat.understanding,
        queue: chat.queue,
        phase: chat.phase,
        picks: chat.picks ?? {},
        revising: chat.revising,
        kept: chat.kept,
        depth: chat.depth,
    };

    return { ...result, chat: { ...result.chat, history: [...(chat.history ?? []), before].slice(-MAX_REWINDS) } };
}

/** How far back answers can be taken, one at a time. */
const MAX_REWINDS = 30;

/**
 * The last answer taken back: the chat as it stood just before it, with the
 * question asked again and what was picked still picked. Everything the
 * answer changed goes with it — the needs, the follow-ups it queued, Lens's
 * reply and whatever came after.
 */
export function rewind(chat: Chat): Chat {
    const history = chat.history ?? [];
    const last = history.at(-1);
    const ask = last ? chat.messages.find((message) => message.id === last.askId) : null;

    if (!last || ask?.kind !== "ask") return chat;

    /* A new id, so the question is drawn afresh with the old answer picked rather than as the answered one. */
    const reopened: ChatMessage = { ...ask, id: messageId(), answered: false, step: { ...ask.step, selected: last.chosen } };
    const messages = chat.messages.slice(0, last.messageCount).map((message) => (message === ask ? reopened : message));

    return {
        ...chat,
        messages,
        understanding: last.understanding,
        queue: last.queue,
        phase: last.phase,
        picks: last.picks,
        revising: last.revising,
        kept: last.kept,
        depth: last.depth,
        history: history.slice(0, -1),
        title: titleFor(last.understanding),
        updatedAt: now(),
    };
}

/** The reader message that "Edit" sits on: their last words, when those answered the last question. Null when there's none. */
export function rewindable(chat: Chat): string | null {
    const last = chat.history?.at(-1);
    const lastSaid = [...chat.messages].reverse().find((message) => message.from === "reader");

    if (!last?.readerId || chat.phase === "judged" || lastSaid?.id !== last.readerId) return null;

    return last.readerId;
}

function answerStep(
    chat: Chat,
    askId: string,
    chosen: string[],
    cars: FinnCar[],
    today: Date,
    extra: { amount?: number; heard?: Heard },
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
                /* The answers start over; how much the reader likes Lens to ask and explain doesn't. */
                queue: chat.depth ? STEP_ORDER.filter((id) => id !== "askDepth" && id !== "explainDepth") : [...STEP_ORDER],
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

    /* -- How much Lens asks and explains ----------------------------------- */
    if (step.id === "askDepth" || step.id === "explainDepth") {
        const level = picked[0]?.id;
        if (!level) return { chat, after: "wait" };

        const depth = { ...depthOf(chat), ...(step.id === "askDepth" ? { ask: level as AskDepth } : { explain: level as ExplainDepth }) };
        const reply = {
            quick: step.id === "askDepth" ? "Quick it is — I'll keep to what I really need, and suggest the rest for you to check." : "Quick it is — my pick and what decided it, with more whenever you ask.",
            balanced: step.id === "askDepth" ? "Balanced it is." : "Balanced it is — my pick, why, and what you'd give up.",
            thorough: "Thorough it is — I'll ask about everything, and you'll set how much each thing counts.",
            detailed: "Detailed it is — you'll see all of my reasoning.",
        }[level] ?? "Got it.";
        const next = touch(base, [reader(tapped), lens(reply)], { depth });

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
        const queue = picks.some((id) => id.startsWith("life-")) ? [...picks.filter((id) => id.startsWith("life-")), "priorities" as StepId, ...picks.filter((id) => !id.startsWith("life-"))] : picks;
        const next = touch(base, [reader(said), lens(picks.length === 1 ? "Sure — here it is again." : "Sure — just those, with what you said last time already picked.")], {
            queue,
            kept: null,
            revising: true,
            /* Chosen to be answered again: asked whatever the depth. */
            explicit: picks,
        });

        return { chat: askNext(next, cars), after: "wait" };
    }

    /* -- The summary looked over: then whether to keep it ----------------- */
    if (step.id === "confirm") {
        if (!picked[0]) return { chat, after: "wait" };

        return { chat: touch(base, [reader(tapped), { id: messageId(), at: now(), from: "lens", kind: "ask", step: KEEP, answered: false }]), after: "wait" };
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
    } else if (step.id === "prioritiesConfirm") {
        /* As proposed, now the reader's own; or each place in turn. */
        if (chosen.includes("order")) queue = ["rank-1", ...queue];
        else understanding = withOrder(understanding, orderOf(understanding));
    } else if (step.id === "prioritiesPick") {
        const proposed = orderOf(understanding);
        /* Nothing picked is nothing changed: the page can't send it, and no priorities would judge nothing. */
        const kept = (chosen.length ? chosen : proposed) as CategoryId[];
        const order = [...proposed.filter((id) => kept.includes(id)), ...kept.filter((id) => !proposed.includes(id))];
        const removed = [...new Set([...(understanding.lens?.removed ?? []).filter((id) => !kept.includes(id)), ...proposed.filter((id) => !kept.includes(id))])];

        said = `These: ${joined(order.map(priorityName))}.`;
        understanding = { ...understanding, lens: { ...understanding.lens, order, removed } };
        if (order.length >= 2) queue = ["rank-1", ...queue];
    } else if (step.id === "top" || step.id.startsWith("rank-")) {
        const n = step.id === "top" ? 1 : Number(step.id.slice("rank-".length));
        const order = orderOf(understanding);
        const pick = chosen[0] as CategoryId | undefined;

        if (pick) {
            const next = [...order.slice(0, n - 1), pick, ...order.slice(n - 1).filter((id) => id !== pick)];

            understanding = withOrder(understanding, next);
            if (step.id !== "top" && next.length - n >= 2) queue = [`rank-${n + 1}` as StepId, ...queue];
        } else {
            /* The rest as they are: the order as it stands is the reader's now. */
            understanding = withOrder(understanding, order);
        }
    } else if (step.guide) {
        /* Words typed here that mean one of this question's own answers — "a big dog" for Pets — count as tapping it. */
        const owns = (choice: { id: string }, u: Understanding) => u.needs.some((need) => need.id === `${step.guide!.id}-${choice.id}`);
        const typedHere = extra.heard ? step.choices.filter((choice) => owns(choice, extra.heard!.understanding) && !owns(choice, chat.understanding)).map((choice) => choice.id) : [];

        chosen = [...new Set([...chosen, ...typedHere])];
        understanding = applyChoices(understanding, step.guide, chosen);

        /* "Nothing over my limit" is the budget's own rule, kept on the budget. */
        if (step.id === "rules" && understanding.budget) {
            const firm = chosen.includes("firm-budget");
            understanding = { ...understanding, budget: { ...understanding.budget, firm, kind: firm ? "hardMax" : understanding.budget.kind } };
        }

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
    ], { queue: [step, ...(step === "life" ? (["priorities"] as StepId[]) : [])], kept: null, revising: true });

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
        messages: chat.messages.map((message) => (message === lastSummary ? summaryOf(understanding, message.id, chat.depth ?? null) : message)),
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
