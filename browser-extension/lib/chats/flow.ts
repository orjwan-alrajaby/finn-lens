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
const topNeeds = (u: Understanding) => {
    const needs = lifeNeeds(u).filter((need) => !need.id.startsWith("life-passengers-"));
    const top = Math.max(0, ...needs.map((need) => LEVEL[need.importance]));

    return needs.filter((need) => LEVEL[need.importance] === top);
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
 * The needs, asked a group at a time: a short question the reader can
 * answer in a glance, rather than seventeen chips at once. Each says why it
 * matters, and each has its own way of saying "none of these".
 */
const GROUP_ASK: Record<NeedGroup, { ask: string; why: string; none: string; placeholder: string }> = {
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
    driving: {
        ask: "Where do you do most of your driving?",
        why: "Each kind of driving adds different equipment: parking sensors and cameras for the city, adaptive cruise control for commuting and motorways, matrix LED and cornering lights for night driving.",
        none: "None of these",
        placeholder: "e.g. “mountain roads at weekends”",
    },
    weather: {
        ask: "What's the weather like where you live?",
        why: "Cold winters add seat heating, a heated steering wheel and rain and light sensors to what I check; hot summers add seat cooling and 3-zone climate control.",
        none: "Nothing unusual",
        placeholder: "e.g. “lots of rain”",
    },
    loads: {
        ask: "What do you carry or tow?",
        why: "Different loads need different equipment. Tap all that apply — the “i” on an answer shows what I'd check.",
        none: "Nothing much",
        placeholder: "e.g. “a double buggy”",
    },
    you: {
        ask: "Last one about you: anything else that matters in a car?",
        why: "These add driver assistance, phone connection, comfort features, or each car's CO₂ emissions to what I check.",
        none: "Nothing else",
        placeholder: "In your own words, e.g. “I drive home after night shifts”",
    },
};

const WHY: Record<string, string> = {
    rules: "Anything you pick here takes cars out before I score them, so only choose what you'd truly refuse.",
    budget: "A car over your limit can't be my pick. I compare each car's FINN price plus estimated fuel or charging and the mileage package your distance needs.",
    period: "FINN prices each car by how long you subscribe, and not every car is offered for every length — so this changes both the price and which cars fit.",
    distance: `FINN's price includes ${FINN_INCLUDED_MONTHLY_KM.toLocaleString("en-GB")} km a month; more needs one of FINN's mileage packages, which adds to each car's price. Your distance also sets what fuel or charging costs you.`,
    focus: "When no car has everything, the need you pick counts most in the ranking, and the others count a step less.",
};

const fromGuide = (step: GuideStep): ChatStep => ({
    id: step.id,
    ask: step.ask,
    why: WHY[step.id],
    multiple: step.multiple,
    choices: step.choices.map(({ id, label, said, description, group, need }) => ({
        id,
        label,
        said,
        description,
        group,
        looksFor: need ? labelsOf(need.evidence) : undefined,
        features: need?.evidence
            .filter((evidence) => EVIDENCE[evidence])
            .map((evidence) => ({ label: EVIDENCE[evidence].label, does: explain(evidence, need.reasons?.[evidence]) })),
    })),
    none: step.none,
    guide: step,
});

/**
 * Who rides along, asked in the light of how many do: with nobody, only
 * whether a pet does; with one, an adult asks nothing of the car, since they
 * sit beside the driver.
 */
function whoRides(choices: GuideChoice[], passengers: number | null): { choices: GuideChoice[]; ask: string; none?: string; multiple: boolean } {
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
        };
    }

    return { choices, ask: GROUP_ASK.people.ask, none: GROUP_ASK.people.none, multiple: true };
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
             * Only a tie at the top needs breaking: when one need already
             * counts more than the rest, the reader has answered this.
             */
            const needs = topNeeds(u);

            if (needs.length < 2) return null;

            const allMust = needs.every((need) => need.importance === "essential");

            return {
                id,
                ask: allMust
                    ? "You've made these all must-haves. If the cars can't give you all of them, which wins?"
                    : "If the cars can't give you everything, which of these matters most?",
                why: WHY.focus,
                multiple: false,
                choices: needs.map((need) => ({ id: need.id, label: need.label, said: `${need.label} matters most.` })),
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
            choices: followUp.choices.map(({ id: choice, label, said }) => ({ id: choice, label, said })),
            none: followUp.multiple ? "None of these" : undefined,
            followUp,
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
                : { choices: own, ask: words?.ask ?? "", none: words?.none, multiple: group !== "passengers" };

        if (!life || !choices.length || !words) return null;

        /* The guide's own step, narrowed to this group, so answering it replaces this group's answers only. */
        return {
            ...fromGuide({ ...life, choices, multiple: ask.multiple }),
            id,
            ask: ask.ask,
            why: words.why,
            none: ask.none,
            custom: { kind: "text", label: "Something else…", placeholder: words.placeholder },
        };
    }

    const step = guideSteps(cars).find((item) => item.id === id);

    if (!step || !step.choices.length || step.id === "life") return null;

    const chat = fromGuide(step);

    if (step.id === "rules") {
        return { ...chat, custom: { kind: "text", label: "Something else…", placeholder: "e.g. “no seven-seaters”" } };
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
            .filter((choice) => owned.has(`${step.guide!.id}-${choice.id}`) || choice.id === `passengers-${u.passengers}` || (!choice.looksFor?.length && tapped.has(choice.id)))
            .map((choice) => choice.id);
    }

    if (step.id === "focus") return valid(u.needs.filter((need) => need.status === "active" && need.importance === "essential").map((need) => need.id)).slice(0, 1);

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
    weather: "Nothing unusual — I won't add anything for the weather.",
    loads: "Nothing much — I won't add anything for loads.",
    you: "Nothing else — I won't add anything more.",
};

/** What Lens says to one group of needs: what it heard — its own picks, and anything typed alongside them. */
function acknowledgeGroup(step: ChatStep, u: Understanding, chosen: string[], before: Set<string>): string {
    const own = new Set(step.choices.map((choice) => `life-${choice.id}`));
    const needs = lifeNeeds(u).filter((need) => own.has(need.id) || (!need.id.startsWith("life-") && !before.has(need.id)));
    /* An answer that adds nothing to check says so in its own words: "One passenger can sit beside you…". */
    const nothingToCheck = step.choices
        .filter((choice) => chosen.includes(choice.id) && !choice.looksFor?.length && choice.description)
        .map((choice) => choice.description!);

    if (!needs.length) {
        if (nothingToCheck.length) return nothingToCheck.join(" ");
        if (step.none === "No pets") return "No pets — nothing to add for them.";

        return NOTHING_HERE[step.id.slice("life-".length) as NeedGroup] ?? "Noted.";
    }

    const looks = [...new Set(needs.flatMap((need) => labelsOf(need.evidence.map((entry) => entry.id))))].slice(0, 4);
    const heard = looks.length
        ? `Got it — ${joined(needs.map((need) => lower(need.label)))}. For ${needs.length === 1 ? "that" : "those"} I'll check things like ${joined(looks.map(lower))}.`
        : `Got it — ${joined(needs.map((need) => lower(need.label)))}.`;

    return [heard, ...nothingToCheck].join(" ");
}

/** What Lens says after an answer: that it heard, and what it will do with it. */
export function acknowledge(step: ChatStep, u: Understanding, chosen: string[] = [], before: Set<string> = new Set()): string {
    if (step.followUp) {
        const replies = step.followUp.choices.filter((choice) => chosen.includes(choice.id)).map((choice) => choice.reply);

        if (!replies.length) return "Fine — I'll keep it as it was.";

        if (step.followUp.replace) return `Got it — I'll count ${joined(replies)}.`;

        return step.followUp.multiple ? `Got it. I'll also count ${joined(replies)}.` : replies.join(" ");
    }

    if (step.offer) {
        return chosen.includes("yes")
            ? `Counting it — ${lower(EVIDENCE[step.offer.id].label)} now weighs in.`
            : "Fine, I'll leave it out and won't offer it again.";
    }

    if (step.id.startsWith("life-")) return acknowledgeGroup(step, u, chosen, before);

    switch (step.id) {
        case "focus": {
            const top = u.needs.find((need) => chosen.includes(need.id));
            const others = step.choices.filter((choice) => !chosen.includes(choice.id)).map((choice) => lower(choice.label));

            return top
                ? `${top.label} now counts most in the ranking. ${joined(others).replace(/^./, (c) => c.toUpperCase())} ${others.length === 1 ? "counts" : "count"} one step less.`
                : "Equal it is — none of them outranks the others.";
        }
        case "rules": {
            const rules = ruledOut(u);

            if (!rules.length) return "Good — nothing's off the table.";

            return `Noted. I'll set aside ${joined(
                rules.map((rule) => (rule.mode === "without" ? asPhrase(rule.id) : `anything that isn't ${asPhrase(rule.id)}`)),
            )} before judging.`;
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

/** What Lens will judge by, as the calibration card shows it. */
export function summaryOf(u: Understanding, id: string = messageId()): Extract<ChatMessage, { kind: "summary" }> {
    const needs = lifeNeeds(u);
    const rules = ruledOut(u);
    const lines: { label: string; value: string; step?: StepId }[] = [];
    const rank: Record<NeedImportance, number> = { essential: 0, important: 1, niceToHave: 2 };

    if (!needs.length) lines.push({ label: "The car has to", value: "Nothing in particular", step: "life" });

    lines.push({
        label: "Rules",
        value: rules.length ? joined(rules.map((rule) => (rule.mode === "without" ? `no ${asPhrase(rule.id).replace(/^an? /, "")}` : `${asPhrase(rule.id)} only`))) : "None",
        step: "rules",
    });
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

    return {
        id,
        at: now(),
        from: "lens",
        kind: "summary",
        needs: [...needs]
            .sort((a, b) => rank[a.importance] - rank[b.importance])
            .map((need) => ({ id: need.id, label: need.label, importance: need.importance, looksFor: labelsOf(need.evidence.filter((entry) => !entry.unwanted).map((entry) => entry.id)) })),
        lines,
        priorities: translation.profile.priorities.map((item) => ({ label: item.label, share: item.sharePercent })),
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
            step: preselect ? { ...step, selected: selectedFor(step, u, chat.picks) } : step,
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
    const picked = step.choices.filter((choice) => chosen.includes(choice.id));
    const tapped = picked.length ? picked.map((choice) => choice.said).join(" ") : "";
    const messages = closeAsks(chat.messages);
    const base: Chat = { ...chat, messages, picks: { ...(chat.picks ?? {}), [step.id]: chosen } };

    /* -- The start of a chat from saved settings ------------------------- */
    if (step.id === "start") {
        const said = tapped;

        if (picked[0]?.id === "judge") return { chat: touch(base, [reader(said)], { phase: "ready" }), after: "judge" };

        if (picked[0]?.id === "change") {
            const next = touch(base, [reader(said), lens("Sure. Here are my questions again, with what you said last time already picked.")], {
                queue: [...STEP_ORDER],
                kept: null,
                revising: true,
            });

            return { chat: askNext(next, cars), after: "wait" };
        }

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
    let said = [tapped, extra.heard?.text].filter(Boolean).join(" ");
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
        understanding = applyChoices(understanding, step.guide, chosen);

        if (step.id.startsWith("life-")) {
            /* The second question about each need where it changes something, straight after its group. */
            const follow = chosen.filter((id) => followUpFor(id)).map((id) => `follow-${id}` as StepId);
            queue = [...follow, ...queue.filter((id) => !follow.includes(id))];
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
export function changeAnswers(chat: Chat, cars: FinnCar[]): Chat {
    const next = touch({ ...chat, messages: closeAsks(chat.messages) }, [
        reader("I'd like to change my answers."),
        lens("Sure. Here are my questions again, with what you said last time already picked."),
    ], { queue: [...STEP_ORDER], kept: null, revising: true });

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
