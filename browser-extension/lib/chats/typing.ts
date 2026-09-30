import { buildLensFacts } from "@/lib/lens-ai/context";
import { createMockAdapter } from "@/lib/lens-ai/mock";
import { buildVocabulary } from "@/lib/lens-ai/vocabulary";
import { evidenceCatalogue } from "@/lib/lens-chat/evidence";
import { evidenceForNeeds } from "@/lib/lens-chat/fit-story";
import { catalogueNeed, guideSteps } from "@/lib/lens-chat/guide";
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
 * Typed needs that mean exactly one of the guide's own answers.
 *
 * The keyword reader has its own names for things. Where one is the same
 * thing as a tap — "a big dog" is Pets, "two teenagers" is Children — the
 * tap's need takes its place: the same dog isn't counted twice, it weighs
 * what a tapped dog weighs, and the question's follow-up still gets asked.
 * A reader's need with no equal among the answers stays as the reader read it.
 */
const AS_TAPPED: Record<string, string> = {
    "the-dogs": "dog",
    "kids-in-and-out": "kids",
    "room-to-carry": "bulky",
    "dark-roads": "night",
    winter: "winter",
    safety: "safety",
    efficient: "emissions",
};

function asTapped(u: Understanding, before: Understanding, cars: FinnCar[]): { understanding: Understanding; heardAs: string[] } {
    const had = new Set(before.needs.map((need) => need.id));
    const labels = new Map((guideSteps(cars).find((step) => step.id === "life")?.choices ?? []).map((choice) => [choice.id, choice.label]));
    const heardAs: string[] = [];
    let needs = u.needs;

    for (const need of u.needs) {
        if (had.has(need.id)) continue;

        const choice = AS_TAPPED[need.id];
        const tapped = choice ? catalogueNeed(choice, cars) : null;

        if (!choice || !tapped) {
            heardAs.push(need.label.toLowerCase());
            continue;
        }

        needs = needs.filter((item) => item.id !== need.id);
        if (!needs.some((item) => item.id === tapped.id)) needs = [...needs, tapped];
        heardAs.push((labels.get(choice) ?? tapped.label).toLowerCase());
    }

    return { understanding: { ...u, needs }, heardAs: [...new Set(heardAs)] };
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
    const { understanding, heardAs } = asTapped(grounded.understanding, chat.understanding, cars);
    const changes = diffUnderstanding(chat.understanding, understanding);
    /* Needs are said by name above; anything else that changed — the budget, the dates — by what it is now. */
    const others = changes.filter((change) => !understanding.needs.some((need) => need.label === change.label)).map((change) => `${change.label.toLowerCase()}: ${change.to}`);

    return { kind: "understanding", reply: grounded.reply, understanding, changes, heardAs: [...heardAs, ...others] };
}
