import { buildLensFacts } from "@/lib/lens-ai/context";
import { createMockAdapter } from "@/lib/lens-ai/mock";
import { buildVocabulary } from "@/lib/lens-ai/vocabulary";
import { evidenceCatalogue } from "@/lib/lens-chat/evidence";
import { evidenceForNeeds } from "@/lib/lens-chat/fit-story";
import { bubbleById, bubblesIn, syncBubbles, withBubbles, type BubbleId } from "@/lib/lens-chat/bubbles";
import { catalogueNeed, ruleNeed } from "@/lib/lens-chat/guide";
import { demandOf } from "@/lib/lens-chat/deals";
import { asPhrase, type EvidenceId } from "@/lib/lens-chat/evidence";
import type { Need } from "@/lib/lens-chat/understanding";
import { lowerFirst } from "@/lib/reasoning-engine/format";
import type { LensRun } from "@/lib/lens-chat/run";
import {
    diffUnderstanding,
    groundInWhatWasSaid,
    readUnderstanding,
    toWire,
    type Understanding,
} from "@/lib/lens-chat/understanding";
import type { FinnCar } from "@/lib/types";

import type { Chat } from "./types";

const joined = (parts: string[]): string =>
    parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/**
 * What Lens says back about words typed beside the taps: how it read them,
 * so a word it couldn't place shows up as missing from the list rather than
 * vanishing — or that it found nothing in them at all.
 */
export function readBack(text: string, read: Read, tapped: boolean): string {
    if (!read.heardAs.length) {
        return `I couldn't find anything in “${text}” that I can check on a car, so ${tapped ? "I've gone with what you tapped" : "nothing changes here"}.`;
    }

    /* Read, but already said — "no high fuel consumption" beside a tapped "Low emissions" — is still read. */
    return `I read “${text}” as ${joined(read.heardAs)}.`;
}

/**
 * What the reader typed, read.
 *
 * Tapping is exact; typing is the reader's own words. Those go through Lens's
 * built-in reader — plain keyword rules, no model and no key — which answers in
 * the same shape a model would: an updated understanding and a short reply.
 * The understanding it returns is checked and merged by the same code a model's
 * would be (`readUnderstanding`, `groundInWhatWasSaid`), so a reader who types
 * "we've got two kids and I can't go over 500" lands in exactly the state the
 * chips would have put them in.
 *
 * A model can take this reader's place later: it is the only thing here that
 * would change.
 */

const reader = createMockAdapter();

export interface Read {
    kind: "understanding" | "answer";
    reply: string;
    understanding: Understanding;
    /** What changed, in the reader's terms. Empty when nothing did. */
    changes: { label: string; from: string; to: string }[];
    /** What Lens took the words to mean, as it can say it back: "children", "pets", "budget: €550/month maximum". */
    heardAs: string[];
}

/**
 * Typed needs that mean one of the life bubbles.
 *
 * The keyword reader has its own names for things. Where one is the same
 * thing as a bubble — "a big dog" is the dog bubble, "two teenagers" is
 * kids — the bubble takes its place: the same dog isn't counted twice, it
 * weighs what a tapped dog weighs, and the summary shows it as the bubble,
 * correctable like any other. A need with no equal among the bubbles stays
 * as the reader read it.
 */
const AS_BUBBLE: Record<string, (text: string) => { bubble: BubbleId; chips: string[] }> = {
    "the-dogs": () => ({ bubble: "dog", chips: [] }),
    "kids-in-and-out": () => ({ bubble: "kids", chips: [] }),
    "room-to-carry": () => ({ bubble: "carry", chips: ["bulky"] }),
    "dark-roads": () => ({ bubble: "night", chips: [] }),
    "long-drives": () => ({ bubble: "long", chips: [] }),
    /* "Eco-friendly" doesn't say how green: the bubble alone, judged on the CO₂ label. */
    clean: () => ({ bubble: "environment", chips: [] }),
    winter: (text) => ({ bubble: "weather", chips: [/snow|\bice\b|icy/i.test(text) ? "snow" : "cold"] }),
    towing: () => ({ bubble: "carry", chips: ["trailer"] }),
    safety: () => ({ bubble: "help", chips: [] }),
};

/**
 * Typed needs that mean one of the guide's needs but no bubble: "low fuel
 * consumption" is how little the car uses, which the keyword reader files
 * under CO₂. It isn't "I'm on a budget", so it stays a need of its own.
 */
const AS_NEED: Record<string, string> = { efficient: "efficiency-matters" };

/**
 * Typed rules that are a deal-breaker row's own: "I need an automatic" is the
 * automatic row set to "Must have", shown and changed there — a rule of its
 * own beside the row stayed in force when the row said "Doesn't matter".
 */
const AS_RULE: Record<string, string> = { automatic: "automatic", "suv-only": "suv-only", "no-suv": "no-suv" };

/** The fuels "What can it run on?" sets aside for each typed wish: electric only, or anything but. */
const AS_FUEL: Record<string, EvidenceId[]> = { electric: ["plugInHybrid", "petrolCar", "dieselCar"], "not-electric": ["electricCar"] };

/** What it runs on, as "What can it run on?" would set it: the same need, so the question shows it picked and changes it. */
const fuelNeed = (out: EvidenceId[], said: string): Need => ({
    id: "fuel",
    label: "What it runs on",
    importance: "essential",
    said,
    priorities: [],
    evidence: out.map((id) => ({ id, use: `Set aside: you'd rather not have ${asPhrase(id)}.`, unwanted: true, mustHave: false })),
    notInData: null,
    status: "active",
});

function asTapped(u: Understanding, before: Understanding, text: string, cars: FinnCar[]): { understanding: Understanding; heardAs: string[] } {
    const had = new Set(before.needs.map((need) => need.id));
    const heardAs: string[] = [];
    const picks: Partial<Record<BubbleId, string[]>> = Object.fromEntries(bubblesIn(u).map(({ bubble, state }) => [bubble.id, state.chips]));
    let needs = u.needs;

    for (const need of u.needs) {
        if (had.has(need.id) || need.id.startsWith("bubble-")) continue;

        const rule = AS_RULE[need.id] ? ruleNeed(AS_RULE[need.id]!) : null;
        if (rule) {
            needs = [...needs.filter((item) => item.id !== need.id && item.id !== rule.id), rule];
            heardAs.push(lowerFirst(demandOf({ id: rule.evidence[0]!.id, mode: rule.evidence[0]!.unwanted ? "without" : "must" })));
            continue;
        }

        if (AS_FUEL[need.id]) {
            needs = [...needs.filter((item) => item.id !== need.id && item.id !== "fuel"), fuelNeed(AS_FUEL[need.id]!, need.said)];
            heardAs.push(need.id === "electric" ? "electric only" : "not electric");
            continue;
        }

        const match = AS_BUBBLE[need.id]?.(text);
        const bubble = match ? bubbleById(match.bubble) : null;
        const catalogue = !bubble && AS_NEED[need.id] ? catalogueNeed(AS_NEED[need.id]!, cars) : null;

        if (catalogue) {
            needs = needs.filter((item) => item.id !== need.id);
            if (!needs.some((item) => item.id === catalogue.id)) needs = [...needs, catalogue];
            heardAs.push(lowerFirst(catalogue.label));
            continue;
        }

        if (!match || !bubble) {
            heardAs.push(lowerFirst(need.label));
            continue;
        }

        needs = needs.filter((item) => item.id !== need.id);
        picks[match.bubble] = [...new Set([...(picks[match.bubble] ?? []), ...match.chips])];
        heardAs.push(lowerFirst(bubble.need));
    }

    return { understanding: withBubbles({ ...u, needs }, picks), heardAs: [...new Set(heardAs)] };
}

export async function readTyped(chat: Chat, message: string, cars: FinnCar[], run: LensRun | null): Promise<Read> {
    const history = chat.messages
        .filter((item): item is Extract<Chat["messages"][number], { kind: "text" }> => item.kind === "text")
        .slice(-8)
        .map((item) => ({ role: item.from, text: item.text }));

    const { result } = await reader.converse({
        message,
        vocabulary: buildVocabulary(),
        understanding: toWire(chat.understanding),
        openQuestion: null,
        answered: [],
        evidence: evidenceCatalogue(cars),
        facts: run
            ? {
                  ...buildLensFacts(run.recommendation, run.narrative),
                  yourSituation: toWire(chat.understanding),
                  evidenceForYourNeeds: evidenceForNeeds(run, chat.understanding),
              }
            : null,
        history,
        today: new Date().toISOString().slice(0, 10),
    });

    if (result.kind === "answer" || !result.understanding) {
        return { kind: "answer", reply: result.reply || "I couldn't answer that from FINN's data.", understanding: chat.understanding, changes: [], heardAs: [] };
    }

    const said = [...history.filter((line) => line.role === "reader").map((line) => line.text), message];
    const grounded = groundInWhatWasSaid(
        result.reply,
        readUnderstanding(result.understanding, chat.understanding, undefined, undefined, result.kind === "whatIf" ? null : message),
        said,
    );
    /* The bubbles' needs, rebuilt from their state: the reader's round trip may have changed them. */
    const { understanding, heardAs } = asTapped(syncBubbles(grounded.understanding), chat.understanding, message, cars);
    const changes = diffUnderstanding(chat.understanding, understanding);
    /* Needs are said by name above; anything else that changed — the budget, the dates — by what it is now. */
    const others = changes.filter((change) => !understanding.needs.some((need) => need.label === change.label)).map((change) => `${lowerFirst(change.label)}: ${change.to}`);

    return { kind: "understanding", reply: grounded.reply, understanding, changes, heardAs: [...heardAs, ...others] };
}
