import { useEffect, useState } from "react";

import { buildCostAnalysis } from "@/lib/reasoning-engine";
import type { CostAnalysis } from "@/lib/reasoning-engine/types";
import { judgeWith, type Judged } from "@/lib/chats/judge";
import { judgedCars, loadedCars } from "@/lib/chats/scope";
import { loadChat } from "@/lib/chats/store";
import type { Chat, Judgement, Verdict } from "@/lib/chats/types";
import { tellFitStory, type FitStory } from "@/lib/lens-chat/fit-story";
import { whyNot, type WhyNot } from "@/lib/lens-chat/why-not";
import type { PinnedFinnCar } from "@/lib/types";

/**
 * One car, read out of the chat's judgement.
 *
 * The drawer doesn't store a reading of its own: it runs the chat's judgement
 * again — the same understanding, over the same cars — and reads this car out
 * of it, so what the drawer says and what the chip on the card says come from
 * one run and cannot disagree.
 */

export interface JudgedCar {
    chat: Chat;
    judgement: Judgement;
    judged: Judged;
    car: PinnedFinnCar;
    verdict: Verdict;
    isWinner: boolean;
    /** Null for a car the reader's rules, or the budget, kept out of the ranking. */
    story: FitStory | null;
    /** How it lost to the pick, for any ranked car that isn't the pick. */
    versus: WhyNot | null;
    cost: CostAnalysis | null;
    /** Cars the judgement covered that Lens no longer holds. */
    missing: number;
    url: string | null;
}

export type Loaded = { state: "loading" } | { state: "gone"; reason: string } | { state: "ready"; value: JudgedCar };

export function useJudgedCar(chatId: string | null, carId: number | null): Loaded {
    const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

    useEffect(() => {
        let alive = true;

        void (async () => {
            const chat = chatId ? await loadChat(chatId) : null;
            const judgement = chat?.judgement;

            if (!chat || !judgement || carId == null) {
                if (alive) setLoaded({ state: "gone", reason: "This chat has no judgement any more." });
                return;
            }

            const { cars, missing } = judgedCars(judgement.carIds, await loadedCars());
            const car = cars.find((item) => item.id === carId);
            const verdict = judgement.verdicts[carId];
            const judged = judgeWith(judgement.understanding, cars, judgement.headline);

            if (!car || !verdict || !judged) {
                if (alive) setLoaded({ state: "gone", reason: "Lens doesn't hold FINN's data for this car any more." });
                return;
            }

            const { run, translation } = judged;
            const ranked = run.recommendation.ranked.some((item) => item.id === carId);
            const isWinner = run.recommendation.winner.id === carId;
            const breakdown = run.recommendation.context.costs[carId];

            if (alive) {
                setLoaded({
                    state: "ready",
                    value: {
                        chat,
                        judgement,
                        judged,
                        car,
                        verdict,
                        isWinner,
                        story: ranked ? tellFitStory(run, judgement.understanding, translation.lessRelevant, null, carId) : null,
                        versus: ranked && !isWinner ? whyNot(run, carId) : null,
                        cost: buildCostAnalysis(car, run.answers.preferences, breakdown),
                        missing,
                        url: judgement.urls[carId] ?? null,
                    },
                });
            }
        })().catch((error: unknown) => {
            console.error("[Lens] couldn't read this car", error);
            if (alive) setLoaded({ state: "gone", reason: "Something went wrong reading this car." });
        });

        return () => {
            alive = false;
        };
    }, [chatId, carId]);

    return loaded;
}
