import type { ScopeKind, WireQuestion } from "@/lib/lens-ai/contract";

import type { GuideStep } from "./guide";
import type { Translation, Understanding } from "./understanding";

/**
 * The conversation with Lens, kept.
 *
 * A chat that forgets itself when the page reloads is a chat nobody can come
 * back to: what they told Lens, what it recommended, what they pinned and
 * which suggestions they took or turned down all vanished with the tab. The
 * reader uses this to remember their own decision, so the whole of it is kept
 * — every message from them and from Lens, every question and its answer,
 * every result, every action — and picked up wherever the chat is opened
 * next, on any listing or car page.
 *
 * Nothing here is deleted by Lens. "New conversation" starts over under a
 * divider, with everything before it still there to scroll back through; only
 * the reader, from "Your data" in Settings, removes it.
 *
 * What is kept is what can be kept honestly. A result is stored as the search
 * that produced it and the cars it ran over — not as a frozen ranking — so
 * reopening the chat ranks those cars again on today's data and says so if
 * some have gone.
 */

export const TRANSCRIPT_KEY = "finnLensChatTranscript";

/** The comparison the card shows: enough to run it again, never the result itself. */
export interface SavedRun {
    scope: ScopeKind;
    headline: string;
    carIds: number[];
}

export interface SavedTranscript<Entry> {
    version: 1;
    savedAt: string;
    /**
     * Counts up with every save, and says which chat frame made it. Every
     * finn.com tab has its own chat frame over the same conversation; a tab
     * only writes while the reader is looking at it, and a tab in the
     * background takes on any newer save — so a forgotten tab can never write
     * an old copy over the conversation happening in another.
     */
    rev: number;
    by: string;
    entries: Entry[];
    understanding: Understanding;
    applied: { understanding: Understanding; translation: Translation } | null;
    lastRun: SavedRun | null;
    openQuestion: WireQuestion | null;
    /** What the model was told the reader answered, and the recent turns it reads. */
    answered: { question: string; answer: string }[];
    history: { role: "reader" | "lens"; text: string }[];
    /** Lens Chat's questions still to come, mid-way through. */
    guide: GuideStep[];
    askingAgain: boolean;
    pendingAnswer: string | null;
    carriedOver: boolean;
}

/** How much of the conversation the model is sent back each turn is small; this is plenty. */
const HISTORY_KEPT = 40;

export async function loadTranscript<Entry>(): Promise<SavedTranscript<Entry> | null> {
    try {
        const stored = await browser.storage.local.get(TRANSCRIPT_KEY);
        const value = stored[TRANSCRIPT_KEY] as SavedTranscript<Entry> | undefined;

        return value?.version === 1 && Array.isArray(value.entries) ? value : null;
    } catch {
        return null;
    }
}

export async function saveTranscript<Entry>(transcript: SavedTranscript<Entry>): Promise<void> {
    try {
        await browser.storage.local.set({
            [TRANSCRIPT_KEY]: { ...transcript, history: transcript.history.slice(-HISTORY_KEPT) },
        });
    } catch (error) {
        /* Out of room, most likely. The conversation on screen is unaffected. */
        console.error("[FinnLens] couldn't keep the conversation", error);
    }
}
