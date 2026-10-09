import { describe, expect, it } from "vitest";

import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { answer, startChat } from "./flow";
import { isChatName, nameFromId, newChatName } from "./store";

describe("a chat's name", () => {
    it("is a random code of letters and digits that can't be misread: no 0 and O, no 1, I and L", () => {
        const names = Array.from({ length: 500 }, () => newChatName());

        for (const name of names) {
            expect(name).toMatch(/^Chat [A-Z2-9]{3}-[A-Z2-9]{3}$/);
            expect(name.slice(5)).not.toMatch(/[01OIL]/);
            expect(isChatName(name)).toBe(true);
        }
        expect(new Set(names).size).toBe(names.length);
    });

    it("is none of the names already taken", () => {
        const taken = Array.from({ length: 40 }, () => newChatName());

        expect(taken).not.toContain(newChatName(taken));
        expect(startChat(null, [], new Date(), taken).title).not.toBeOneOf(taken);
    });

    it("comes from the id for a chat from before names, the same every time, and none taken", () => {
        const name = nameFromId("chat-lx3k9-ab12c");

        expect(isChatName(name)).toBe(true);
        expect(nameFromId("chat-lx3k9-ab12c")).toBe(name);
        expect(nameFromId("chat-lx3k9-ab12d")).not.toBe(name);
        expect(nameFromId("chat-lx3k9-ab12c", [name])).not.toBe(name);
        /* A title made from the answers isn't a name. */
        expect(isChatName("You have kids · You live in the city")).toBe(false);
    });

    it("stays the same as the answers come in", () => {
        const cars = [GARAGE.safeCompact(), GARAGE.familySuv(), GARAGE.cityHatch()];
        const chat = startChat(null, cars, new Date("2026-09-29T10:00:00Z"));
        const open = [...chat.messages].reverse().find((message) => message.kind === "ask" && !message.answered)!;
        const next = answer(chat, open.id, ["go"], cars, new Date("2026-09-29T10:00:00Z")).chat;

        expect(isChatName(chat.title)).toBe(true);
        expect(next.title).toBe(chat.title);
    });
});
