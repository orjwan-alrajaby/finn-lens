import { activeChat } from "@/lib/chats/store";

import { getLoadedCars } from "../data/cache";
import { CARD_SELECTORS, cardConfigId } from "./currentCar";

/**
 * What the popup says about the page it was opened over.
 *
 * Counted from the cards FINN has drawn, not from anything Lens stored, so
 * "24 cars on this page" is the number the reader can see.
 */

export interface PageStats {
    /** Distinct cars FINN has drawn a card for. */
    detected: number;
    /** Of those, the ones Lens holds FINN's data for, and can judge. */
    readable: number;
    /** Of those, the ones the open chat has judged: each wears a chip. */
    judged: number;
    /** The chat's pick, when its card is on this page. */
    winnerHere: boolean;
}

export const PAGE_STATS = "LENS_PAGE_STATS";

export async function pageStats(): Promise<PageStats> {
    const ids = new Set<number>();

    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTORS)) {
        const id = cardConfigId(card);
        if (id != null) ids.add(id);
    }

    const [loaded, chat] = await Promise.all([getLoadedCars(), activeChat()]);
    const verdicts = chat?.judgement?.verdicts ?? {};
    const shown = [...ids];

    return {
        detected: shown.length,
        readable: shown.filter((id) => id in loaded).length,
        judged: shown.filter((id) => id in verdicts).length,
        winnerHere: chat?.judgement?.winnerId != null && ids.has(chat.judgement.winnerId),
    };
}

/** Answers the popup. Not async: an async listener answers every message, including ones it ignores. */
export function answerStats(): void {
    browser.runtime.onMessage.addListener((message: { type?: string }, sender, sendResponse) => {
        if (message?.type !== PAGE_STATS || sender.id !== browser.runtime.id || sender.tab) return undefined;

        void pageStats().then(sendResponse, () => sendResponse(null));

        return true;
    });
}
