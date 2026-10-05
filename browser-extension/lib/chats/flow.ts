import { lowerFirst } from "@/lib/reasoning-engine/format";
import { formatEUR } from "@/lib/reasoning-engine";
import { FINN_INCLUDED_MONTHLY_KM } from "@/lib/reasoning-engine/constants";
import { addMonths, monthLabel, type MonthString } from "@/lib/reasoning-engine/contract";
import type { NeedImportance } from "@/lib/lens-ai/contract";
import {
    BUBBLES,
    bubbleById,
    bubbleHeading,
    bubblesIn,
    importanceOf,
    importanceSaid,
    itemsOf,
    OFTEN,
    suggestedRules,
    syncBubbles,
    withBubbles,
    withBubbleState,
    withItem,
    withoutItem,
    worthHere,
    type BubbleId,
    type OftenId,
} from "@/lib/lens-chat/bubbles";
import { asPhrase, barePhrase, EVIDENCE, isKind, type EvidenceId } from "@/lib/lens-chat/evidence";
import { applyChoices, explain, guideSteps, saidFor, type GuideChoice, type GuideStep } from "@/lib/lens-chat/guide";
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

import { applyFollowUp, offerReason } from "./follow-ups";
import { BASE_ANSWERS } from "./judge";
import { messageId, newChatId } from "./store";
import type { BubbleChips, Chat, ChatMessage, ChatStep, Rewind, SavedSettings, StepId, SummaryBubble } from "./types";

/**
 * How a conversation with Lens goes, as pure functions over a `Chat`.
 *
 * Every step returns the next chat; nothing here waits, reads storage or runs
 * the engine, so the whole conversation can be walked in a test. The chat
 * page owns the timing (Lens "typing"), reading what the reader types, and
 * the judgement itself.
 *
 * The shape of it (docs/LIFE-BUBBLES-SPEC-v2.md):
 *
 * 1. Lens greets the reader and says what's about to happen.
 * 2. "Tell me about your life": one screen of bubbles, some opening a row of
 *    chips under themselves. Then up to two "how often" questions, the
 *    monthly limit, how long, how far (only where it matters), and anything
 *    that's a deal-breaker — four to six questions in all.
 * 3. Every question says why it's asked, has answers to tap, and takes the
 *    reader's own words too. Anything already said isn't asked again.
 * 4. "Here's what I understood": what Lens will check for each bubble, what
 *    might matter too, what it can't check, and how much each counts — for
 *    the reader to correct. Then whether to keep it as their settings.
 * 5. It judges the cars on the page (the chat page does this part).
 *
 * A reader with saved settings is greeted with them instead, and can judge
 * straight away, change something, or start from scratch.
 */

/**
 * The questions, in the order Lens asks them. How far they drive is asked
 * only after a bubble it matters to; otherwise it's assumed, and said so.
 */
export const STEP_ORDER: StepId[] = ["bubbles", "often-long", "often-traffic", "budget", "period", "distance", "rules"];

const now = () => new Date().toISOString();

const lens = (text: string): ChatMessage => ({ id: messageId(), at: now(), from: "lens", kind: "text", text });
const reader = (text: string): ChatMessage => ({ id: messageId(), at: now(), from: "reader", kind: "text", text });

const joined = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const lower = lowerFirst;

const lifeNeeds = (u: Understanding) => u.needs.filter((need) => need.status === "active" && need.priorities.length > 0);

/** Anything said about the reader's life: a bubble, or needs in their own words. */
const saidAnything = (u: Understanding) => bubblesIn(u).length > 0 || lifeNeeds(u).length > 0;

/* -------------------------------------------------------------------------- */
/* Changing some answers                                                      */
/* -------------------------------------------------------------------------- */

/** The questions a reader can pick to answer again, in the order they're asked. */
const CHANGEABLE: StepId[] = ["bubbles", "often-long", "often-traffic", "budget", "period", "distance", "rules"];

const CHANGE_LABEL: Partial<Record<StepId, string>> = {
    bubbles: "Your life",
    "often-long": "How often you drive far",
    "often-traffic": "How long your drive is",
    rules: "Deal-breakers",
    budget: "Monthly limit",
    period: "How long",
    distance: "How far you drive",
};

/** What a question's answer is now, in a few words: "€700 a month", "you have kids and you drive at night a lot". */
function nowSaid(step: StepId, u: Understanding): string {
    switch (step) {
        case "bubbles": {
            const said = bubblesIn(u).map(({ bubble }) => lower(bubble.you));
            return said.length ? joined(said) : "nothing";
        }
        case "rules":
            return rulesText(u).toLowerCase() === "none" ? "none" : lowerFirst(rulesText(u));
        case "budget":
            return u.budget ? `${formatEUR(u.budget.monthly)} a month` : "no fixed limit";
        case "period":
            return u.rental ? `${monthLabel(u.rental.from)} to ${monthLabel(u.rental.to)}` : "not set";
        case "distance":
            return u.monthlyKm ? `about ${u.monthlyKm.value.toLocaleString("en-GB")} km a month` : "not said";
    }

    if (step.startsWith("often-")) {
        const often = step.slice("often-".length) as OftenId;
        const said = OFTEN[often]?.choices.find((choice) => choice.id === u.bubbles?.[often]?.often);
        return said ? lower(said.label) : "not said";
    }

    return "";
}

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

/** How much a need counts, in the reader's words. */
export const IMPORTANCE_LABEL: Record<NeedImportance, string> = {
    essential: "Must have",
    important: "Matters",
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

const WHY: Record<string, string> = {
    bubbles: "Each one tells me what to look for on the cars. Next I'll show you what I'll check for each, what I can't, and how much it counts — and you can correct any of it.",
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

/** "kids:baby" → the bubble and the chip; "kids" → the bubble alone. */
const CHIP = ":";

/** The bubbles question: every bubble, what it means and counts behind its "i", and the chips it opens. */
function bubblesStep(): ChatStep {
    return {
        id: "bubbles",
        ask: "Tell me about your life. Tap everything that fits.",
        why: WHY.bubbles,
        multiple: true,
        choices: BUBBLES.map((bubble) => ({
            id: bubble.id,
            label: bubble.label,
            said: bubble.said,
            means: bubble.means,
            looksFor: bubble.counts.length ? labelsOf(bubble.counts) : undefined,
            features: bubble.counts.map((id) => ({ label: EVIDENCE[id].label, does: explain(id, bubble.why?.[id]) })),
        })),
        bubbleChips: Object.fromEntries(
            BUBBLES.filter((bubble) => bubble.chips).map((bubble): [string, BubbleChips] => [
                bubble.id,
                {
                    ask: bubble.chips!.ask,
                    multiple: bubble.chips!.multiple,
                    max: bubble.chips!.max,
                    required: bubble.chips!.mode === "required",
                    exclusive: bubble.chips!.exclusive,
                    options: bubble.chips!.options.map(({ id, label }) => ({ id, label })),
                },
            ]),
        ),
        none: "None of these",
        custom: { kind: "text", label: "Something else…", placeholder: "e.g. “home late after night shifts”" },
    };
}

/** The bubbles and chips a bubbles answer picked. */
function bubblePicks(chosen: string[]): Partial<Record<BubbleId, string[]>> {
    const picks: Partial<Record<BubbleId, string[]>> = {};

    for (const id of chosen) {
        const [bubble, chip] = id.split(CHIP) as [BubbleId, string | undefined];
        if (!bubbleById(bubble)) continue;

        picks[bubble] = [...(picks[bubble] ?? []), ...(chip ? [chip] : [])];
    }

    return picks;
}

/** Lens's question for `id`, narrowed to what's worth asking about these cars. Null when it isn't. */
export function stepFor(id: StepId, cars: FinnCar[], u: Understanding = EMPTY_UNDERSTANDING): ChatStep | null {
    switch (id) {
        case "bubbles":
            return bubblesStep();

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
                /* Only questions this chat would ask: how often, only for a bubble that asks it. */
                choices: CHANGEABLE.filter((step) => stepFor(step, cars, u)).map((step) => ({
                    id: step,
                    label: CHANGE_LABEL[step]!,
                    said: CHANGE_LABEL[step]!,
                    description: `Now: ${nowSaid(step, u)}.`,
                })),
                none: "Never mind",
            };

        case "keep":
        case "confirm":
        case "focus":
        case "offers":
        case "life":
            return null;
    }

    /* How often: only for a bubble the reader tapped that asks it. */
    if (id.startsWith("often-")) {
        const often = id.slice("often-".length) as OftenId;
        const def = OFTEN[often];

        if (!def || !u.bubbles?.[often]) return null;

        return {
            id,
            ask: def.ask,
            why: def.why,
            multiple: false,
            choices: def.choices.map(({ id: choice, label, said }) => ({ id: choice, label, said })),
        };
    }

    /* Chats from before the bubbles: their group, follow-up, offer and seat questions are no longer asked. */
    if (id.startsWith("life-") || id.startsWith("follow-") || id.startsWith("offer-") || id.startsWith("check-passengers-")) return null;

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

    if (step.id === "rules") {
        /*
         * The deal-breakers the reader's bubbles point to, first, with why:
         * "six seats or more" for a reader who needs six seats, rather than
         * only a lower score for every five-seater.
         */
        const from = new Map<string, string>();
        for (const { bubble, state } of bubblesIn(u)) for (const rule of suggestedRules(bubble, state)) if (!from.has(rule)) from.set(rule, lower(bubble.you));

        const suggested = step.choices.filter((choice) => from.has(choice.id));
        const chat = fromGuide({ ...step, choices: [...suggested, ...step.choices.filter((choice) => !from.has(choice.id))] });

        return {
            ...chat,
            why: suggested.length
                ? `${WHY.rules} ${joined(suggested.map((choice) => `“${choice.label}” is first because ${from.get(choice.id)}`))}.`
                : WHY.rules,
            /* Electric only and not electric together would rule out every car. */
            exclusive: [["electric-only", "not-electric"]],
            custom: { kind: "text", label: "Something else…", placeholder: "e.g. “no seven-seaters”" },
        };
    }

    return { ...fromGuide(step), why: WHY.distance, custom: { kind: "km", label: "Another distance", placeholder: "km a month, e.g. 1,200", min: 50, max: 10000 } };
}

/** What the reader said last time, so changing an answer starts from it. */
export function selectedFor(step: ChatStep, u: Understanding, picks: Record<string, string[]> = {}): string[] {
    const valid = (ids: string[]) => ids.filter((id) => step.choices.some((choice) => choice.id === id));

    if (step.id === "bubbles") return bubblesIn(u).flatMap(({ bubble, state }) => [bubble.id, ...state.chips.map((chip) => `${bubble.id}${CHIP}${chip}`)]);

    if (step.id.startsWith("often-")) {
        const often = u.bubbles?.[step.id.slice("often-".length)]?.often;
        return often ? valid([often]) : [];
    }

    if (step.guide?.id === "rules") {
        const owned = new Set(u.needs.filter((need) => need.status === "active").map((need) => need.id));

        return step.choices.filter((choice) => owned.has(`rules-${choice.id}`) || (choice.id === "firm-budget" && u.budget?.firm)).map((choice) => choice.id);
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
        case "bubbles":
        case "life":
            return saidAnything(u);
        default:
            if (id.startsWith("often-")) return u.bubbles?.[id.slice("often-".length)]?.often != null;
            return false;
    }
}

/** Whether how far they drive matters to anything they said: long drives, traffic, a budget. */
const needsDistance = (u: Understanding) => bubblesIn(u).some(({ bubble }) => bubble.distance);

/* -------------------------------------------------------------------------- */
/* Saying it back                                                             */
/* -------------------------------------------------------------------------- */

/** What Lens says after an answer: that it heard, and what it will do with it. */
export function acknowledge(step: ChatStep, u: Understanding, chosen: string[] = []): string {
    if (step.followUp) {
        const picked = step.followUp.choices.filter((choice) => chosen.includes(choice.id));

        if (!picked.length) return "Fine — I'll keep it as it was.";
        if (!step.followUp.multiple) return picked.map((choice) => choice.reply).join(" ");

        const counted = [...new Set(picked.flatMap((choice) => (choice.add ?? []).map((add) => lower(EVIDENCE[add.id].label))))];

        return `Got it — I'll ${step.followUp.replace ? "" : "also "}count ${joined(counted)}.`;
    }

    if (step.offer) {
        return chosen.includes("yes")
            ? `Counting it — ${lower(EVIDENCE[step.offer.id].label)} now weighs in.`
            : "Fine, I'll leave it out and won't offer it again.";
    }

    /* A question from before the bubbles, still open in an old chat. */
    if (step.id.startsWith("life-") || step.id.startsWith("check-passengers-") || step.id === "focus") return "Got it.";

    if (step.id === "bubbles") {
        const said = bubblesIn(u).map(({ bubble }) => lower(bubble.you));
        const others = lifeNeeds(u).filter((need) => !need.id.startsWith("bubble-")).map((need) => lower(need.label));
        const all = [...said, ...others];

        return all.length
            ? `Got it — ${joined(all)}. Once I have your limits, I'll show you what I'll check for each, and you can correct it.`
            : "Nothing here, then.";
    }

    if (step.id.startsWith("often-")) {
        const often = step.id.slice("often-".length) as OftenId;
        const bubble = bubbleById(often);
        const state = u.bubbles?.[often];

        if (!bubble || !state) return "Got it.";

        return `${lower(bubble.need).replace(/^./, (c) => c.toUpperCase())} will count as ${lower(IMPORTANCE_LABEL[importanceOf(bubble, state)])}${importanceOf(bubble, state) === "important" ? " to you" : ""}.`;
    }

    switch (step.id) {
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

const FIGURE: Partial<Record<string, string>> = {
    environmental: "Each car's CO₂ per km",
    efficiency: "Each car's fuel or electricity use, against others of its kind",
};

/**
 * Each bubble as the summary shows it: what Lens will check, each item
 * removable; standard equipment it checks; suggestions the cars here differ
 * on, each one to add; and what it can't check. An item another bubble
 * already counts isn't suggested again.
 */
function summaryBubbles(u: Understanding, cars: FinnCar[]): SummaryBubble[] {
    const tapped = bubblesIn(u);
    const countedAnywhere = new Set(tapped.flatMap(({ bubble, state }) => itemsOf(bubble, state).counts));
    const settled = new Set(ruledOut(u).map((rule) => rule.id));
    const named = (ids: EvidenceId[]) => ids.filter((id) => EVIDENCE[id]).map((id) => ({ id, label: EVIDENCE[id].label }));

    return tapped.map(({ bubble, state }) => {
        const items = itemsOf(bubble, state);
        const figure = bubble.figures?.map((id) => FIGURE[id]).find(Boolean);
        const settledHere = items.counts.filter((id) => settled.has(id));

        return {
            id: bubble.id,
            heading: bubbleHeading(bubble, state),
            importance: importanceOf(bubble, state),
            importanceSaid: importanceSaid(bubble, state),
            /* What a deal-breaker already settles isn't checked: every car left has it. */
            counts: named(items.counts.filter((id) => !settled.has(id))),
            checks: named(items.checks.filter((id) => !settled.has(id))),
            worth: named(worthHere(items.worth, cars).filter((id) => !countedAnywhere.has(id) && !settled.has(id))),
            ...(figure ? { figure } : {}),
            cantCheck: bubble.cantCheck,
            ...(!items.counts.length && !figure && bubble.empty ? { empty: bubble.empty } : {}),
            ...(settledHere.length
                ? { settled: `${joined(settledHere.map((id, index) => (index ? lower(EVIDENCE[id].label) : EVIDENCE[id].label)))} ${settledHere.length > 1 ? "are deal-breakers" : "is a deal-breaker"}, so every car left has ${settledHere.length > 1 ? "them" : "it"}.` }
                : {}),
        };
    });
}

/** What Lens will judge by, as the summary shows it: "Here's what I understood". */
export function summaryOf(u: Understanding, id: string = messageId(), cars: FinnCar[] = []): Extract<ChatMessage, { kind: "summary" }> {
    /* Needs from the reader's own words, beside the bubbles. */
    const needs = lifeNeeds(u).filter((need) => !need.id.startsWith("bubble-"));
    const lines: { label: string; value: string; step?: StepId }[] = [];
    const rank: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };

    if (!saidAnything(u)) lines.push({ label: "Your life", value: "Nothing in particular", step: "bubbles" });

    lines.push({ label: "Monthly limit", value: u.budget ? `${formatEUR(u.budget.monthly)} all in${u.budget.firm ? ", nothing over it" : ""}` : "No fixed limit", step: "budget" });
    lines.push({ label: "For", value: u.rental ? `${monthLabel(u.rental.from)} – ${monthLabel(u.rental.to)}` : "Not set", step: "period" });
    lines.push({
        label: "Driving",
        value: u.monthlyKm
            ? `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month`
            : `About ${BASE_ANSWERS.preferences.monthlyKm.toLocaleString("en-GB")} km a month (assumed — you didn't say)`,
        step: "distance",
    });
    lines.push({ label: "Deal-breakers", value: rulesText(u), step: "rules" });

    /* Each item once, under the first need to name it. */
    const seen = new Set<string>();

    return {
        id,
        at: now(),
        from: "lens",
        kind: "summary",
        bubbles: summaryBubbles(u, cars),
        needs: [...needs]
            .sort((a, b) => rank[a.importance] - rank[b.importance])
            .map((need) => {
                const all = need.evidence.length ? labelsOf(checked(need, u)) : need.priorities.map((priority) => FIGURE[priority]).filter((label): label is string => Boolean(label));
                const looksFor = all.filter((label) => !seen.has(label));

                all.forEach((label) => seen.add(label));

                return { id: need.id, label: need.label, importance: need.importance, looksFor, also: all.length - looksFor.length };
            }),
        lines,
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
    why: "Nothing is saved or judged until you say so. Until then you can take anything out, add a suggestion, set how much each counts, or change a line.",
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
    ask: "Want to tell me something about your life?",
    why: "Everything I judge comes from what you tell me: the equipment it points me at, or a car's CO₂. With nothing said, I have nothing to judge fit on.",
    multiple: false,
    choices: [{ id: "add", label: "Pick something", said: "Let me pick something." }],
    custom: { kind: "text", label: "Say it in my own words…", placeholder: "e.g. “long drives with two kids”" },
};

/**
 * Asks the next question still worth asking, or — when there are none —
 * says back what Lens understood and waits for the reader to say it's right.
 */
export function askNext(chat: Chat, cars: FinnCar[]): Chat {
    const preselect = chat.revising;
    const u = chat.understanding;
    let queue = [...chat.queue];

    while (queue.length) {
        const id = queue.shift()!;

        /* Equipment worth a look is on the summary now, not a question each. */
        if (id === "offers" || id === "focus") continue;

        /* How far they drive, only where something they said makes it matter: otherwise it's assumed, and said so. */
        if (id === "distance" && !preselect && !needsDistance(u)) continue;

        /* Already said in their own words: asking would be asking them to repeat themselves. */
        if (!preselect && answered(id, u)) continue;

        const step = stepFor(id, cars, u);
        if (!step) continue;

        const ask: ChatMessage = {
            id: messageId(),
            at: now(),
            from: "lens",
            kind: "ask",
            /* What's already been said — typed earlier, or kept from last time — shows as picked, so answering doesn't undo it. */
            step: preselect || id === "bubbles" ? { ...step, selected: selectedFor(step, u, chat.picks) } : step,
            answered: false,
        };

        return touch({ ...chat, messages: closeAsks(chat.messages) }, [ask], { queue, phase: "asking" });
    }

    /*
     * Nothing said about the reader's life: there's nothing to judge fit on.
     * The engine would fall back on its own default order and then tell the
     * reader "you put safety first" — so Lens says so and asks, instead.
     */
    if (!lifeNeeds(u).length) {
        return touch(
            { ...chat, messages: closeAsks(chat.messages) },
            [
                lens(
                    "You haven't told me anything the car has to do, so I have nothing to judge how well each car fits you — only what it costs. For cost alone, FINN's own list and its price filter are the better tool.",
                ),
                { id: messageId(), at: now(), from: "lens", kind: "ask", step: NO_NEEDS, answered: false },
            ],
            { queue: [], phase: "asking" },
        );
    }

    return touch(
        { ...chat, messages: closeAsks(chat.messages) },
        [
            lens("Here's what I understood. Take out anything that's wrong, add anything that might matter, and set how much each counts."),
            summaryOf(u, messageId(), cars),
            { id: messageId(), at: now(), from: "lens", kind: "ask", step: CONFIRM, answered: false },
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
                    "Here's how it works: tap what fits your life, and answer a few short questions — tap, or say it in your own words. I'll show you what I understood before I judge anything. Then every car on this page gets a chip saying how well it fits you, and my top pick gets a trophy.",
                ),
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
        summaryOf(understanding, messageId(), cars),
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
    };

    return { ...result, chat: { ...result.chat, history: [...(chat.history ?? []), before].slice(-MAX_REWINDS) } };
}

/** How far back answers can be taken, one at a time. */
const MAX_REWINDS = 30;

/**
 * The last answer taken back: the chat as it stood just before it, with the
 * question asked again and what was picked still picked. Everything the
 * answer changed goes with it — the bubbles, the questions it queued, Lens's
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

/** The bubbles answer in the reader's words: "I have kids — a baby or toddler seat. I live in the city — on the street." */
function bubblesSaid(chosen: string[]): string {
    const picks = bubblePicks(chosen);

    return BUBBLES.filter((bubble) => picks[bubble.id])
        .map((bubble) => {
            const chips = (bubble.chips?.options ?? []).filter((option) => picks[bubble.id]!.includes(option.id)).map((option) => lower(option.label));
            return chips.length ? `${bubble.label} — ${joined(chips)}.` : bubble.said;
        })
        .join(" ");
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
                queue: [...STEP_ORDER],
                kept: null,
                picks: {},
            });

            return { chat: askNext(next, cars), after: "wait" };
        }

        return { chat, after: "wait" };
    }

    /* -- Nothing said yet: back to the bubbles --------------------------- */
    if (step.id === "noNeeds") {
        if (extra.heard) {
            const next = touch(base, [reader(extra.heard.text), lens(extra.heard.reply || "Got it.")], { understanding: extra.heard.understanding, queue: [] });
            return { chat: askNext(next, cars), after: "wait" };
        }

        const next = touch(base, [reader(tapped || "Let me pick something."), lens("Here they are again.")], { queue: ["bubbles"], revising: true });
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

        /* The picked questions in the order they're asked, and how often again for a bubble newly tapped. */
        const picks = CHANGEABLE.filter((id) => chosen.includes(id));
        const queue = picks.includes("bubbles") ? [...new Set<StepId>([...picks, "often-long", "often-traffic"])] : picks;
        const next = touch(base, [reader(said), lens(picks.length === 1 ? "Sure — here it is again." : "Sure — just those, with what you said last time already picked.")], {
            queue: CHANGEABLE.filter((id) => queue.includes(id)),
            kept: null,
            revising: true,
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
    const queue = base.queue;

    if (step.id === "bubbles") {
        /*
         * The taps, and any bubble the reader's own words landed on — "we
         * have a dog" is the dog bubble — kept beside them rather than undone
         * by the taps that came with them.
         */
        const picks = bubblePicks(chosen);
        for (const { bubble, state } of bubblesIn(understanding)) {
            if (!picks[bubble.id] && !chat.understanding.bubbles?.[bubble.id]) picks[bubble.id] = state.chips;
        }

        understanding = withBubbles(understanding, picks);
        said = [bubblesSaid(chosen), typed].filter(Boolean).join(" ");
    } else if (step.id.startsWith("often-")) {
        understanding = withBubbleState(understanding, step.id.slice("often-".length) as BubbleId, { often: picked[0]?.id ?? null, importance: null });
    } else if (step.followUp) {
        understanding = applyFollowUp(understanding, step.followUp, chosen);
    } else if (step.offer) {
        understanding = chosen.includes("yes")
            ? withSuggestion(understanding, step.offer.id, explain(step.offer.id, offerReason(step.offer.needId, step.offer.id)), step.offer.needId)
            : withoutSuggestion(understanding, step.offer.id);
    } else if (step.guide) {
        /* Words typed here that mean one of this question's own answers count as tapping it. */
        const owns = (choice: { id: string }, u: Understanding) => u.needs.some((need) => need.id === `${step.guide!.id}-${choice.id}`);
        const typedHere = extra.heard ? step.choices.filter((choice) => owns(choice, extra.heard!.understanding) && !owns(choice, chat.understanding)).map((choice) => choice.id) : [];

        chosen = [...new Set([...chosen, ...typedHere])];
        /* A deal-breaker can settle what a bubble counts: its need is rebuilt beside the rules. */
        understanding = syncBubbles(applyChoices(understanding, step.guide, chosen));

        /* "Nothing over my limit" is the budget's own rule, kept on the budget. */
        if (step.id === "rules" && understanding.budget) {
            const firm = chosen.includes("firm-budget");
            understanding = { ...understanding, budget: { ...understanding.budget, firm, kind: firm ? "hardMax" : understanding.budget.kind } };
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

    /* Nothing tapped: the reader said this question's own "none". */
    if (!said) said = chosen.length && step.guide ? saidFor(step.guide, chosen) : (step.none ?? "");

    const reply = [extra.heard?.reply, acknowledge(step, understanding, chosen)].filter(Boolean).join(" ");
    const next = touch(base, [reader(said), lens(reply)], { understanding, queue });

    return { chat: askNext(next, cars), after: "wait" };
}

/** The reader wants to change what they said: all of it, or which parts is asked next. */
export function changeAnswers(chat: Chat, cars: FinnCar[]): Chat {
    const next = touch({ ...chat, messages: closeAsks(chat.messages) }, [reader("I'd like to change my answers.")], { queue: ["changeHow"] });

    return askNext(next, cars);
}

const CHANGE_WHAT: Partial<Record<StepId, string>> = {
    bubbles: "what I told you about my life",
    rules: "my deal-breakers",
    budget: "my monthly limit",
    period: "how long I need it",
    distance: "how far I drive",
};

/** One answer, changed from the summary: that question again, then back to the summary. */
export function changeOne(chat: Chat, step: StepId, cars: FinnCar[]): Chat {
    const queue: StepId[] = step === "bubbles" ? ["bubbles", "often-long", "often-traffic"] : [step];
    const next = touch({ ...chat, messages: closeAsks(chat.messages) }, [reader(`I'd like to change ${CHANGE_WHAT[step] ?? "that"}.`)], { queue, kept: null, revising: true });

    return askNext(next, cars);
}

/**
 * The understanding changed from the summary — an importance, an item taken
 * out or added. The summary on screen is redrawn in place: it's the same
 * card, now saying what the reader chose.
 */
function redrawn(chat: Chat, understanding: Understanding, cars: FinnCar[]): Chat {
    const lastSummary = [...chat.messages].reverse().find((message) => message.kind === "summary");

    return {
        ...chat,
        understanding,
        title: titleFor(understanding),
        updatedAt: now(),
        messages: chat.messages.map((message) => (message === lastSummary ? summaryOf(understanding, message.id, cars) : message)),
    };
}

/** How much one need — or one bubble's need — counts, set from the summary. */
export function setImportance(chat: Chat, needId: string, importance: NeedImportance, cars: FinnCar[] = []): Chat {
    const bubble = needId.startsWith("bubble-") ? (needId.slice("bubble-".length) as BubbleId) : null;
    const understanding =
        bubble && chat.understanding.bubbles?.[bubble]
            ? withBubbleState(chat.understanding, bubble, { importance })
            : { ...chat.understanding, needs: chat.understanding.needs.map((need) => (need.id === needId ? { ...need, importance } : need)) };

    return redrawn(chat, understanding, cars);
}

/** Something a bubble counts, taken out from the summary. */
export function removeItem(chat: Chat, bubble: BubbleId, item: EvidenceId, cars: FinnCar[] = []): Chat {
    return redrawn(chat, withoutItem(chat.understanding, bubble, item), cars);
}

/** A suggestion added to what a bubble counts, from the summary. */
export function addItem(chat: Chat, bubble: BubbleId, item: EvidenceId, cars: FinnCar[] = []): Chat {
    return redrawn(chat, withItem(chat.understanding, bubble, item), cars);
}

/**
 * "See why" opened on a result. Opened on the last two results in a row,
 * and later results open that way too — the reader keeps wanting the rest.
 */
export function openedWhy(chat: Chat, resultId: string): Chat {
    const results = chat.messages.filter((message) => message.kind === "result").map((message) => message.id);
    const opened = [...new Set([...(chat.opened ?? []), resultId])].filter((id) => results.includes(id));
    const lastTwo = results.slice(-2);

    return { ...chat, opened, longResults: chat.longResults || (lastTwo.length === 2 && lastTwo.every((id) => opened.includes(id))) };
}

/** "Keep it short": results open short again, until the reader opens two in a row. */
export const keepShort = (chat: Chat): Chat => ({ ...chat, opened: [], longResults: false });

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
