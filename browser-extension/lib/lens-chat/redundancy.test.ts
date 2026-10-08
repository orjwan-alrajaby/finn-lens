import { describe, expect, it } from "vitest";

import { FOLLOW_UPS, WORTH_A_LOOK } from "@/lib/chats/follow-ups";

import { BUBBLES } from "./bubbles";
import { EVIDENCE, type EvidenceId } from "./evidence";
import { guideSteps, purposeOf } from "./guide";

/*
 * A feature's description is what it does, and the reason beside it is why
 * it's there for this reader; the two are said as one sentence. A reason
 * that restates the description read back as "the car steering to stay in
 * its lane and keeping its distance, while you supervise, so the car keeps
 * its lane and distance while you supervise". Every pairing Lens can make
 * is held to saying something new.
 */

const STOP = new Set("a an the and or of to in on for with without your you it its is are be that this so as at by from while when can car cars any every each more less no not than".split(" "));
const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, "").replace(/e$/, "").slice(0, 6);
const words = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !STOP.has(word))
        .map(stem);

function reasons(): { from: string; id: EvidenceId; why: string }[] {
    return [
        ...BUBBLES.flatMap((bubble) => Object.entries(bubble.why ?? {}).map(([id, why]) => ({ from: `the ${bubble.id} bubble`, id: id as EvidenceId, why: why! }))),
        ...guideSteps([])
            .flatMap((step) => step.choices)
            .flatMap((choice) => Object.entries(choice.need?.reasons ?? {}).map(([id, why]) => ({ from: `the guide's ${choice.id}`, id: id as EvidenceId, why: why! }))),
        ...Object.entries(FOLLOW_UPS).flatMap(([key, followUp]) =>
            followUp.choices.flatMap((choice) => (choice.add ?? []).map((add) => ({ from: `the ${key} follow-up`, id: add.id, why: add.why }))),
        ),
        ...Object.entries(WORTH_A_LOOK).flatMap(([key, list]) => list.map((item) => ({ from: `${key}'s worth a look`, id: item.id, why: item.why }))),
    ];
}

describe("a feature's reason beside its description", () => {
    it("says something the description hasn't", () => {
        const echoes = reasons()
            .filter(({ id }) => purposeOf(id))
            .map(({ from, id, why }) => {
                const said = new Set(words(purposeOf(id)));
                const reason = words(why);
                const shared = reason.filter((word) => said.has(word));
                return { text: `${EVIDENCE[id].label} (${from}): "${purposeOf(id)}, ${why}"`, ratio: reason.length ? shared.length / reason.length : 0 };
            })
            /* A word in common is fine — "rear doors… for the back seat"; most of the reason again isn't. */
            .filter((item) => item.ratio >= 0.4)
            .map((item) => item.text);

        expect(echoes).toEqual([]);
    });
});
