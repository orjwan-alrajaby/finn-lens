import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DATA_GROUPS } from "./data";
import { ACTIVE_CHAT_KEY, CHATS_KEY, OPEN_BUBBLE_KEY, SETTINGS_KEY } from "./store";

/*
 * The reader can only delete what Settings lists. A key the code writes and
 * this list misses would be a key nobody can clear.
 */

const listed = new Set(DATA_GROUPS.flatMap((group) => group.keys));

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

describe("what Lens stores", () => {
    it("lists every key Lens's chats use", () => {
        for (const key of [CHATS_KEY, ACTIVE_CHAT_KEY, SETTINGS_KEY, OPEN_BUBBLE_KEY, "loadedCarsFromFinnApi", "finnLensChatSize"]) {
            expect(listed.has(key), key).toBe(true);
        }
    });

    it("lists every finnLens key written anywhere in the extension", () => {
        const root = join(__dirname, "..", "..");
        const written = new Set(
            [...sources(join(root, "lib")), ...sources(join(root, "entrypoints"))].flatMap((file) =>
                [...readFileSync(file, "utf8").matchAll(/"(finnLens[A-Za-z]+)"/g)].map((match) => match[1]!),
            ),
        );

        for (const key of written) expect(listed.has(key), key).toBe(true);
    });

    it("gives each key one home", () => {
        const all = DATA_GROUPS.flatMap((group) => group.keys);
        expect(new Set(all).size).toBe(all.length);
    });
});
