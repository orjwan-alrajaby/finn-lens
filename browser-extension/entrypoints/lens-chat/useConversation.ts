import { useCallback, useRef, useState } from "react";

import { requestOpenDrawer } from "@/lib/chats/bridge";
import {
    answer,
    askNext,
    changeAnswers,
    rentalMonths,
    rewind,
    startChat,
    STEP_ORDER,
    withExchange,
    withLensSaying,
    changeOne as changeOneAnswer,
    setImportance as setNeedImportance,
    type Heard,
} from "@/lib/chats/flow";
import { judgementFrom, judgeWith, resultMessage, withJudgement } from "@/lib/chats/judge";
import { addedToJudgement, judgedCars, loadedCars } from "@/lib/chats/scope";
import { loadChat, loadSettings, messageId, saveChat, saveSettings, setActiveChat } from "@/lib/chats/store";
import type { Chat } from "@/lib/chats/types";
import { readBack, readTyped } from "@/lib/chats/typing";
import type { LensRun } from "@/lib/lens-chat/run";
import { carNamed, whyNot } from "@/lib/lens-chat/why-not";
import type { PinnedFinnCar } from "@/lib/types";

/**
 * The chat on screen, and everything the reader can do to it.
 *
 * The conversation's rules live in `lib/chats/flow.ts`; this is the part that
 * waits — for the reader's words to be read, for the engine, for storage — and
 * keeps the page's chips on the chat that is open.
 */

export interface PageCars {
    cars: PinnedFinnCar[];
    headline: string;
    url: string;
    urls: Record<number, string>;
}

/** "Why this car?", "why?" — about the pick. */
const WHY = /^\s*why\s+(this|that|the)\s+(car|one)\s*\??\s*$|^\s*why\s*\??\s*$|^\s*why\s+(did\s+it|it)\s+win\b/i;
/** "Why not the MG 4?", "what about the Qashqai?" — about another car. */
const WHY_NOT = /\bwhy\s+(not|didn'?t|did\s+you\s+not)\b|\bwhat\s+about\b|\binstead\s+of\b/i;

const BESIDE = "The whole case for it — how it fits each thing you told me, what you'd give up, and why not the others — is open beside the page, and you can save it as a PDF.";

/** The engine's own reasons for its pick, in the chat. */
function whyItWon(run: LensRun): string {
    const { verdict } = run.narrative;
    const reasons = verdict.reasons.slice(0, 2).join(" ");

    return [reasons || verdict.headline, verdict.budgetNote ?? verdict.marginNote].filter(Boolean).join(" ");
}

export function useConversation(page: PageCars) {
    const [chat, setChat] = useState<Chat | null>(null);
    const [busy, setBusy] = useState(false);
    const latest = useRef<Chat | null>(null);
    const pageRef = useRef(page);
    pageRef.current = page;

    const commit = useCallback(async (next: Chat) => {
        latest.current = next;
        setChat(next);
        await saveChat(next);
    }, []);

    /* -- Which chat --------------------------------------------------------- */

    const startNew = useCallback(async () => {
        const next = startChat(await loadSettings(), pageRef.current.cars);

        await commit(next);
        /* A chat with no judgement takes the chips off the page: they belong to the chat on screen. */
        await setActiveChat(next.id);

        return next;
    }, [commit]);

    const open = useCallback(async (id: string) => {
        const found = await loadChat(id);

        if (!found) return null;

        latest.current = found;
        setChat(found);
        await setActiveChat(found.id);

        return found;
    }, []);

    /** One need's importance, set from the summary. */
    const importance = useCallback(
        async (needId: string, level: "essential" | "important" | "niceToHave") => {
            const current = latest.current;
            if (current) await commit(setNeedImportance(current, needId, level));
        },
        [commit],
    );

    /** The last answer taken back, and its question asked again. */
    const takeBack = useCallback(async () => {
        const current = latest.current;
        if (current && !busy) await commit(rewind(current));
    }, [busy, commit]);

    /** One answer, changed from the summary. */
    const changeOne = useCallback(
        async (step: Parameters<typeof changeOneAnswer>[1]) => {
            const current = latest.current;
            if (current) await commit(changeOneAnswer(current, step, pageRef.current.cars));
        },
        [commit],
    );

    /** The chat on screen was deleted. */
    const clear = useCallback(() => {
        latest.current = null;
        setChat(null);
    }, []);

    /* -- Judging ------------------------------------------------------------ */

    const judge = useCallback(
        /* The page's cars, unless a set is given: the page's added to what was judged before. */
        async (from: Chat, set: Pick<PageCars, "cars" | "headline" | "urls"> = pageRef.current) => {
            const { cars, headline, urls } = set;
            const { url } = pageRef.current;

            if (!cars.length) {
                await commit(
                    withLensSaying(
                        { ...from, phase: "ready" },
                        "I can't see any cars on this page to judge yet. Open a car listing on finn.com — your filters are fine — and I'll judge the cars there.",
                    ),
                );
                return;
            }

            setBusy(true);

            try {
                const judged = judgeWith(from.understanding, cars, headline);

                if (!judged) throw new Error("the engine returned nothing");

                const at = new Date().toISOString();
                const result = resultMessage(judged, cars, headline, urls, messageId(), at);
                const judgement = judgementFrom(judged, cars, from.understanding, headline, url, urls, at);

                const next = withLensSaying({ ...withJudgement(from, judgement), phase: "judged" }, `I've judged the ${headline}. Here's what I found:`);

                await commit({
                    ...next,
                    messages: [
                        ...next.messages,
                        result,
                        {
                            id: messageId(),
                            at,
                            from: "lens",
                            kind: "text",
                            text: "Every car I judged now has a chip on its card. Tap any chip to see how that car fits you, or the gold one to see why it won.",
                        },
                    ],
                });
                await setActiveChat(from.id);
            } catch (error) {
                console.error("[Lens] couldn't judge these cars", error);
                await commit(withLensSaying(from, "Something went wrong while I was judging these cars. Try again in a moment."));
            } finally {
                setBusy(false);
            }
        },
        [commit],
    );

    /* -- Tapping an answer -------------------------------------------------- */

    const tap = useCallback(
        async (askId: string, chosen: string[], extra: { amount?: number; text?: string } = {}) => {
            const current = latest.current;
            if (!current || busy) return;

            const ask = current.messages.find((message) => message.id === askId);

            /*
             * Their own words, read in the question's context before the taps
             * are applied on top — so "I also drive home after night shifts"
             * joins "kids in the back" rather than replacing it.
             */
            let heard: Heard | undefined;

            if (extra.text) {
                setBusy(true);

                try {
                    const read = await readTyped(current, extra.text, pageRef.current.cars, null);

                    heard = {
                        text: extra.text,
                        understanding: read.understanding,
                        /*
                         * On the needs and rules questions Lens says how it
                         * read the words — "as children and pets" — so a word
                         * it couldn't place is missing from the list, not
                         * silently gone. Elsewhere its reader's reply does.
                         */
                        reply:
                            (ask?.kind === "ask" && (ask.step.id.startsWith("life-") || ask.step.id === "rules")) || !read.changes.length
                                ? readBack(extra.text, read, chosen.length > 0)
                                : read.reply || "Got it.",
                    };
                } finally {
                    setBusy(false);
                }
            }

            const { chat: next, after } = answer(current, askId, chosen, pageRef.current.cars, new Date(), { amount: extra.amount, heard });

            if (next === current) return;

            if (ask?.kind === "ask" && ask.step.id === "keep" && next.kept === "settings") {
                await saveSettings({
                    savedAt: new Date().toISOString(),
                    fromChatId: next.id,
                    understanding: next.understanding,
                    rentalMonths: rentalMonths(next.understanding),
                    picks: next.picks,
                    depth: next.depth,
                });
            }

            await commit(next);

            if (after === "judge") await judge(next);
        },
        [busy, commit, judge],
    );

    /* -- Typing ------------------------------------------------------------- */

    /** The last judgement, run again, for questions about it. */
    const lastRun = useCallback(async (current: Chat) => {
        if (!current.judgement) return null;

        const { cars } = judgedCars(current.judgement.carIds, await loadedCars());

        return judgeWith(current.judgement.understanding, cars, current.judgement.headline)?.run ?? null;
    }, []);

    const type = useCallback(
        async (text: string) => {
            const current = latest.current;
            const message = text.trim();

            if (!current || !message || busy) return;

            setBusy(true);

            try {
                /* Questions about a judgement Lens can answer from the judgement itself. */
                if (current.phase === "judged" && current.judgement) {
                    const run = await lastRun(current);

                    if (run && WHY.test(message)) {
                        await commit(withExchange(current, message, `${whyItWon(run)} ${BESIDE}`));
                        if (current.judgement.winnerId != null) void requestOpenDrawer(current.id, current.judgement.winnerId);
                        return;
                    }

                    const named = run && WHY_NOT.test(message) ? carNamed(run, message) : null;
                    const reasons = named && run ? whyNot(run, named.id) : null;

                    if (reasons) {
                        await commit(withExchange(current, message, reasons.sentences.join(" ")));
                        return;
                    }
                }

                const read = await readTyped(current, message, pageRef.current.cars, current.phase === "judged" ? await lastRun(current) : null);

                if (!read.changes.length) {
                    await commit(withExchange(current, message, read.reply || "I didn't catch anything I can judge cars by in that. You can tap one of the answers instead."));
                    return;
                }

                const heard = withExchange(current, message, read.reply || "Got it.", read.understanding);

                /*
                 * The question on screen wasn't answered by what they typed:
                 * ask it again after, rather than losing it.
                 */
                const open = [...current.messages].reverse().find((item) => item.kind === "ask" && !item.answered);
                const queue =
                    open?.kind === "ask" && (STEP_ORDER.includes(open.step.id) || open.step.id.startsWith("life-"))
                        ? [open.step.id, ...heard.queue.filter((id) => id !== open.step.id)]
                        : heard.queue;

                /*
                 * Anything that changes what Lens judges by comes back round to
                 * "here's what I'll judge by — keep it?", however it was said.
                 */
                await commit(askNext({ ...heard, queue: current.phase === "asking" ? queue : [], phase: current.phase === "asking" ? "asking" : "keep" }, pageRef.current.cars));
            } catch (error) {
                console.error("[Lens] couldn't read that", error);
                await commit(withExchange(current, message, "Sorry, I couldn't read that one. Could you tap an answer instead?"));
            } finally {
                setBusy(false);
            }
        },
        [busy, commit, lastRun],
    );

    /* -- Quick replies ------------------------------------------------------ */

    const whyWinner = useCallback(async () => {
        const current = latest.current;
        const run = current ? await lastRun(current) : null;

        if (!current || !run) return;

        await commit(withExchange(current, "Why this car?", `${whyItWon(run)} ${BESIDE}`));
        if (current.judgement?.winnerId != null) void requestOpenDrawer(current.id, current.judgement.winnerId);
    }, [commit, lastRun]);

    const change = useCallback(async () => {
        const current = latest.current;
        if (current) await commit(changeAnswers(current, pageRef.current.cars));
    }, [commit]);

    const judgeHere = useCallback(async () => {
        const current = latest.current;
        if (current) await judge(withExchange(current, "Judge the cars on this page.", null));
    }, [judge]);

    /** This page's cars added to the judgement, keeping every car judged before. */
    const addHere = useCallback(async () => {
        const current = latest.current;
        if (!current) return;

        const judged = current.judgement ? judgedCars(current.judgement.carIds, await loadedCars()).cars : [];
        const { cars, headline } = addedToJudgement(judged, pageRef.current.cars, pageRef.current.headline);

        await judge(withExchange(current, "Add the cars on this page to the judgement.", null), {
            cars,
            headline,
            urls: { ...current.judgement?.urls, ...pageRef.current.urls },
        });
    }, [judge]);

    return { chat, busy, startNew, open, clear, tap, type, whyWinner, change, changeOne, importance, judgeHere, addHere, takeBack };
}
