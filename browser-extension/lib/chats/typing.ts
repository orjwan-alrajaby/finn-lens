import { buildLensFacts } from "@/lib/lens-ai/context";
import { createMockAdapter } from "@/lib/lens-ai/mock";
import { buildVocabulary } from "@/lib/lens-ai/vocabulary";
import { evidenceCatalogue } from "@/lib/lens-chat/evidence";
import { evidenceForNeeds } from "@/lib/lens-chat/fit-story";
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
        return { kind: "answer", reply: result.reply || "I couldn't answer that from FINN's data.", understanding: chat.understanding, changes: [] };
    }

    const said = [...history.filter((line) => line.role === "reader").map((line) => line.text), message];
    const { reply, understanding } = groundInWhatWasSaid(
        result.reply,
        readUnderstanding(result.understanding, chat.understanding, undefined, undefined, result.kind === "whatIf" ? null : message),
        said,
    );

    return { kind: "understanding", reply, understanding, changes: diffUnderstanding(chat.understanding, understanding) };
}
