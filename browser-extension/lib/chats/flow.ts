import { formatEUR } from "@/lib/reasoning-engine";
import { FINN_INCLUDED_MONTHLY_KM } from "@/lib/reasoning-engine/constants";
import { addMonths, monthLabel, type MonthString } from "@/lib/reasoning-engine/contract";
import { asPhrase, EVIDENCE } from "@/lib/lens-chat/evidence";
import { applyChoices, guideSteps, saidFor, type GuideStep } from "@/lib/lens-chat/guide";
import {
    EMPTY_UNDERSTANDING,
    ruledOut,
    toAnswers,
    waiveEssential,
    withBudget,
    withRental,
    type Understanding,
} from "@/lib/lens-chat/understanding";
import type { FinnCar } from "@/lib/types";

import { BASE_ANSWERS } from "./judge";
import { messageId, newChatId } from "./store";
import type { Chat, ChatMessage, ChatStep, SavedSettings, StepId } from "./types";

/**
 * How a conversation with Lens goes, as pure functions over a `Chat`.
 *
 * Every step returns the next chat; nothing here waits, reads storage or runs
 * the engine, so the whole conversation can be walked in a test. The chat
 * page owns the timing (Lens "typing"), the reader typing freely, and the
 * judgement itself.
 *
 * The shape of it:
 *
 * 1. Lens greets the reader and says what's about to happen.
 * 2. It asks what the car has to do, anything that rules a car out, the
 *    monthly limit, how long they need it and how far they drive — each with
 *    pre-made answers, and each skipped once the reader has already said it.
 * 3. It says back what it will judge by, and asks whether to keep that as
 *    the reader's settings or use it for this chat only.
 * 4. It judges the cars on the page (the chat page does this part).
 *
 * A reader with saved settings is greeted with them instead, and can judge
 * straight away, change something for this chat, or start from scratch.
 */

/** The questions, in the order Lens asks them. */
export const STEP_ORDER: StepId[] = ["life", "rules", "budget", "period", "distance"];

const now = () => new Date().toISOString();

const lens = (text: string): ChatMessage => ({ id: messageId(), at: now(), from: "lens", kind: "text", text });
const reader = (text: string): ChatMessage => ({ id: messageId(), at: now(), from: "reader", kind: "text", text });

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

const fromGuide = (step: GuideStep): ChatStep => ({
    id: step.id,
    ask: step.ask,
    hint: step.hint,
    multiple: step.multiple,
    choices: step.choices.map(({ id, label, said }) => ({ id, label, said })),
    none: step.none,
    guide: step,
});

/** Lens's question for `id`, narrowed to what's worth asking about these cars. Null when it isn't. */
export function stepFor(id: StepId, cars: FinnCar[]): ChatStep | null {
    if (id === "budget") {
        return {
            id,
            ask: "What's the most you'd spend a month?",
            hint: "All in: the subscription, fuel or charging, and any kilometres over FINN's allowance. Tap one, or type an amount.",
            multiple: false,
            choices: BUDGETS.map((amount) => ({
                id: `budget-${amount}`,
                label: `Up to ${formatEUR(amount)}`,
                said: `Up to ${formatEUR(amount)} a month.`,
            })),
            none: "No fixed limit",
        };
    }

    if (id === "period") {
        return {
            id,
            ask: "How long do you need the car for?",
            hint: "FINN prices each car by the length of the subscription, so this changes what each one costs.",
            multiple: false,
            choices: PERIODS.map((period) => ({ id: `period-${period.months}`, label: period.label, said: period.said })),
            none: "Not sure yet",
        };
    }

    if (id === "start") {
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
    }

    const step = guideSteps(cars).find((item) => item.id === id);

    return step && step.choices.length ? fromGuide(step) : null;
}

/** What the reader said last time, so changing an answer starts from it. */
export function selectedFor(step: ChatStep, u: Understanding): string[] {
    if (step.id === "life" || step.id === "rules") {
        const owned = new Set(u.needs.filter((need) => need.status === "active").map((need) => need.id));

        return step.choices.filter((choice) => owned.has(`${step.id}-${choice.id}`)).map((choice) => choice.id);
    }

    if (step.id === "budget" && u.budget) {
        const match = step.choices.find((choice) => choice.id === `budget-${u.budget!.monthly}`);
        return match ? [match.id] : [];
    }

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
            return u.needs.some((need) => need.status === "active" && need.priorities.length > 0);
        default:
            return false;
    }
}

/* -------------------------------------------------------------------------- */
/* Saying it back                                                             */
/* -------------------------------------------------------------------------- */

const joined = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const lower = (value: string) => (/^(I\b|[A-Z]{2,})/.test(value) ? value : value.charAt(0).toLowerCase() + value.slice(1));

/** What Lens says after an answer: that it heard, and what it will do with it. */
export function acknowledge(step: ChatStep, u: Understanding): string {
    switch (step.id) {
        case "life": {
            const needs = u.needs.filter((need) => need.status === "active" && need.id.startsWith("life-"));

            if (!needs.length) return "No problem — I'll weigh what FINN lists on each car evenly.";

            const looks = [...new Set(needs.flatMap((need) => need.evidence.map((entry) => EVIDENCE[entry.id].label)))].slice(0, 3);

            return looks.length
                ? `Got it. For that I'll look at things like ${joined(looks.map(lower))}.`
                : "Got it — I'll weigh that when I judge the cars.";
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
                : "Fine — I'll go by each car's usual price.";
        case "distance":
            return u.monthlyKm
                ? u.monthlyKm.value > FINN_INCLUDED_MONTHLY_KM
                    ? `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month. That's over FINN's included allowance, so I'll add the extra kilometres to each car's cost.`
                    : `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month — that goes into each car's running cost.`
                : `I'll assume about ${BASE_ANSWERS.preferences.monthlyKm.toLocaleString("en-GB")} km a month, then.`;
        default:
            return "";
    }
}

/** What Lens will judge by, as the calibration card shows it. */
export function summaryOf(u: Understanding): Extract<ChatMessage, { kind: "summary" }> {
    const needs = u.needs.filter((need) => need.status === "active" && need.priorities.length);
    const rules = ruledOut(u);
    const lines: { label: string; value: string }[] = [];

    lines.push({ label: "The car has to", value: needs.length ? joined(needs.map((need) => lower(need.label))) : "Nothing in particular" });

    if (rules.length) {
        lines.push({
            label: "Rules",
            value: joined(rules.map((rule) => (rule.mode === "without" ? `no ${asPhrase(rule.id).replace(/^an? /, "")}` : `${asPhrase(rule.id)} only`))),
        });
    }

    lines.push({ label: "Monthly limit", value: u.budget ? `${formatEUR(u.budget.monthly)} all in` : "No fixed limit" });
    lines.push({ label: "For", value: u.rental ? `${monthLabel(u.rental.from)} – ${monthLabel(u.rental.to)}` : "Not set" });
    lines.push({
        label: "Driving",
        value: u.monthlyKm
            ? `About ${u.monthlyKm.value.toLocaleString("en-GB")} km a month`
            : `About ${BASE_ANSWERS.preferences.monthlyKm.toLocaleString("en-GB")} km a month (my guess)`,
    });

    const translation = toAnswers(BASE_ANSWERS, u);

    return {
        id: messageId(),
        at: now(),
        from: "lens",
        kind: "summary",
        lines,
        priorities: translation.profile.priorities.map((item) => ({ label: item.label, share: item.sharePercent })),
    };
}

/** A name for the chat the reader will recognise in a list. */
export function titleFor(u: Understanding): string {
    const needs = u.needs.filter((need) => need.status === "active" && need.priorities.length).map((need) => need.label);

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

/**
 * Asks the next question still worth asking, or — when there are none —
 * says back what Lens will judge by and asks whether to keep it.
 */
export function askNext(chat: Chat, cars: FinnCar[]): Chat {
    const preselect = chat.revising;
    let queue = [...chat.queue];

    while (queue.length) {
        const id = queue.shift()!;

        /* Already said in their own words: asking would be asking them to repeat themselves. */
        if (!preselect && answered(id, chat.understanding)) continue;

        const step = stepFor(id, cars);
        if (!step) continue;

        const ask: ChatMessage = {
            id: messageId(),
            at: now(),
            from: "lens",
            kind: "ask",
            step: preselect ? { ...step, selected: selectedFor(step, chat.understanding) } : step,
            answered: false,
        };

        return touch({ ...chat, messages: closeAsks(chat.messages) }, [ask], { queue, phase: "asking" });
    }

    const keep: ChatMessage = {
        id: messageId(),
        at: now(),
        from: "lens",
        kind: "ask",
        answered: false,
        step: {
            id: "keep",
            ask: "Shall I keep these as your settings, so every new chat starts from them? Or use them just for this chat?",
            multiple: false,
            choices: [
                { id: "keep-settings", label: "Save as my settings", said: "Save these as my settings." },
                { id: "keep-chat", label: "Just for this chat", said: "Just for this chat." },
            ],
        },
    };

    return touch(
        { ...chat, messages: closeAsks(chat.messages) },
        [lens("Here's what I'll judge the cars by:"), summaryOf(chat.understanding), keep],
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
        judgement: null,
    };

    if (!settings) {
        return askNext(
            touch(base, [
                lens("Hi, I'm Lens. I help you choose between the cars on finn.com."),
                lens(
                    "Here's how it works: I'll ask a few quick questions about how you'll use the car — tap an answer, or type in your own words. Then I'll judge the cars on this page against what you told me. Every car gets a chip saying how well it fits you, and my top pick gets a trophy. Tap any chip to see why.",
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

    return touch({ ...base, understanding, queue: [], phase: "ready", kept: "settings" }, [
        lens("Welcome back! I'll start from your saved settings:"),
        summaryOf(understanding),
        { id: messageId(), at: now(), from: "lens", kind: "ask", step: start, answered: false },
    ]);
}

/**
 * The reader tapped an answer to the question in `messageId`.
 *
 * Returns the chat moved on, and what the chat page has to do next: nothing,
 * or judge the cars.
 */
export function answer(
    chat: Chat,
    askId: string,
    chosen: string[],
    cars: FinnCar[],
    today = new Date(),
): { chat: Chat; then: "wait" | "judge" } {
    const ask = chat.messages.find((message) => message.id === askId);

    if (!ask || ask.kind !== "ask" || ask.answered) return { chat, then: "wait" };

    const step = ask.step;
    const picked = step.choices.filter((choice) => chosen.includes(choice.id));
    const said = picked.length ? picked.map((choice) => choice.said).join(" ") : (step.none ?? "");
    const messages = closeAsks(chat.messages);
    const base = { ...chat, messages };

    /* -- The start of a chat from saved settings ------------------------- */
    if (step.id === "start" && picked[0]?.id === "judge") {
        return { chat: touch(base, [reader(said)], { phase: "ready" }), then: "judge" };
    }

    if (step.id === "start" && picked[0]?.id === "change") {
        const next = touch(base, [reader(said), lens("Sure. Here are my questions again, with what you said last time already picked.")], {
            queue: [...STEP_ORDER],
            kept: null,
            revising: true,
        });

        return { chat: askNext(next, cars), then: "wait" };
    }

    if (step.id === "start" && picked[0]?.id === "scratch") {
        const next = touch(base, [reader(said), lens("Starting fresh — your saved settings stay as they are.")], {
            understanding: EMPTY_UNDERSTANDING,
            queue: [...STEP_ORDER],
            kept: null,
        });

        return { chat: askNext(next, cars), then: "wait" };
    }

    /* -- Keep as settings, or this chat only ----------------------------- */
    if (step.id === "keep") {
        if (!picked[0]) return { chat, then: "wait" };

        const kept = picked[0].id === "keep-settings" ? "settings" : "chat";

        return {
            chat: touch(
                base,
                [
                    reader(said),
                    lens(
                        kept === "settings"
                            ? "Saved. New chats will start from these, and you can change them any time by starting a chat."
                            : "Okay — just this chat. Your saved settings, if you have any, stay as they are.",
                    ),
                ],
                { kept, phase: "ready" },
            ),
            then: "judge",
        };
    }

    /* -- One of the questions -------------------------------------------- */
    let understanding = chat.understanding;

    if (step.guide) {
        understanding = applyChoices(understanding, step.guide, chosen);
    } else if (step.id === "budget") {
        const amount = picked[0] ? Number(picked[0].id.replace("budget-", "")) : null;
        understanding = amount ? withBudget(understanding, amount, said) : waiveEssential(understanding, "budget");
    } else if (step.id === "period") {
        const months = picked[0] ? Number(picked[0].id.replace("period-", "")) : null;
        understanding = months ? rentalFor(understanding, months, said, today) : waiveEssential(understanding, "rental");
    }

    const next = touch(base, [reader(step.guide ? saidFor(step.guide, chosen) : said), lens(acknowledge(step, understanding))], {
        understanding,
    });

    return { chat: askNext(next, cars), then: "wait" };
}

/** The reader wants to change what they said, after a judgement. */
export function changeAnswers(chat: Chat, cars: FinnCar[]): Chat {
    const next = touch({ ...chat, messages: closeAsks(chat.messages) }, [
        reader("I'd like to change my answers."),
        lens("Sure. Here are my questions again, with what you said last time already picked."),
    ], { queue: [...STEP_ORDER], kept: null, revising: true });

    return askNext(next, cars);
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
