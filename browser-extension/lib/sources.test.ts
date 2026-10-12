import { describe, expect, it } from "vitest";

import { stepFor } from "@/lib/chats/flow";
import { withBubbles } from "@/lib/lens-chat/bubbles";
import { tellFitStory } from "@/lib/lens-chat/fit-story";
import { runLens } from "@/lib/lens-chat/run";
import { EMPTY_UNDERSTANDING, toAnswers } from "@/lib/lens-chat/understanding";
import { DEFAULT_CATEGORY_FEATURES, DEFAULT_PREFERENCES, DEFAULT_PRIORITIES } from "@/lib/reasoning-engine/constants";
import { fleet } from "@/lib/reasoning-engine/test-data/fleet";

import { SOURCES } from "./sources";

describe("sources, named and linked wherever a figure or rule isn't FINN's", () => {
    it("are each a name and an https link", () => {
        for (const source of Object.values(SOURCES)) {
            expect(source.name.length).toBeGreaterThan(10);
            expect(source.url).toMatch(/^https:\/\//);
        }
    });

    it("go with the CO₂ label, the EU's plug-in figures and the CO₂ deal-breaker in the chat", () => {
        const environment = stepFor("bubbles-matters", fleet())!.bubbleChips!.environment!;
        expect(environment.options.find((option) => option.id === "moderate")?.sources).toEqual([SOURCES.co2Label]);
        expect(environment.options.find((option) => option.id === "zero")?.sources).toEqual([SOURCES.co2Label]);
        expect(environment.options.find((option) => option.id === "clean")?.sources).toBeUndefined();

        const fuel = stepFor("fuel", fleet(), withBubbles(EMPTY_UNDERSTANDING, { environment: ["zero"] }))!;
        expect(fuel.choices.find((choice) => choice.id === "fuel-plugInHybrid")?.sources).toEqual([SOURCES.euRegistrations]);
        expect(fuel.choices.find((choice) => choice.id === "fuel-electricCar")?.sources).toEqual([SOURCES.co2Label]);

        expect(stepFor("deals", fleet().slice(0, 60))!.deals!.find((row) => row.id === "co2")?.sources).toEqual([SOURCES.co2Label]);
    });

    it("go with the CO₂ scale in the drawer, and with the Commission's finding for a plug-in, said with its date", () => {
        const plugIn = fleet().find((car) => car.fuelType === "Plug-in Hybrid")!;
        const u = withBubbles(EMPTY_UNDERSTANDING, { environment: [] });
        const base = { priorities: [...DEFAULT_PRIORITIES], preferences: { ...DEFAULT_PREFERENCES }, features: structuredClone(DEFAULT_CATEGORY_FEATURES) } as never;
        const run = runLens([plugIn], toAnswers(base, u).answers, "page", "page")!;
        const lines = tellFitStory(run, u, [], null).sections.flatMap((section) => section.lines);

        expect(lines.find((line) => line.text.startsWith("Lens places emissions"))?.sources).toEqual([SOURCES.co2Label, SOURCES.icctFleet]);
        const finding = lines.find((line) => line.sources?.includes(SOURCES.realWorldGap));
        expect(finding?.text).toBe("The European Commission found plug-ins registered in 2021 emitted 3.5 times their official CO₂ on the road. The EU changed the official method from 2025; FINN's figures use the new one.");
    });
});
