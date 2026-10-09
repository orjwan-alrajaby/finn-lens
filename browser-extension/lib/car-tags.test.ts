import { describe, expect, it } from "vitest";

import { assessEfficiency, assessEnvironment } from "@/lib/reasoning-engine/environmental";
import { GARAGE } from "@/lib/reasoning-engine/test-garage";

import { carTags } from "./car-tags";

describe("a car's tags", () => {
    it("say what it runs on, how much it uses and its CO₂, each with the figure it rests on", () => {
        const car = GARAGE.thirstyPetrol();
        const tags = carTags(car);

        expect(tags.map((tag) => tag.id)).toEqual(["fuel", "use", "co2"]);
        expect(tags[0]).toMatchObject({ label: "Petrol" });
        expect(tags[1]).toMatchObject({ label: "Thirsty", figure: assessEfficiency(car)!.display, tone: "poor" });
        expect(tags[2]!.figure).toBe(`Class ${assessEnvironment(car)!.co2!.className}`);
    });

    it("say an electric car puts out no CO₂ at the tailpipe, and call heavy use power-hungry rather than thirsty", () => {
        const car = GARAGE.longRangeEv();
        const tags = carTags(car);

        expect(tags[0]).toMatchObject({ label: "Electric" });
        expect(tags.find((tag) => tag.id === "co2")).toMatchObject({ label: "No tailpipe CO₂", figure: "Class A", tone: "good" });
        expect(tags.find((tag) => tag.id === "use")?.label).not.toBe("Thirsty");
    });

    it("leave out how much a plug-in hybrid uses: FINN's one figure mixes fuel and electricity", () => {
        const car = { ...GARAGE.safeCompact(), fuelType: "Plug-in Hybrid" as const };

        expect(carTags(car).map((tag) => tag.id)).not.toContain("use");
        expect(carTags(car)[0]).toMatchObject({ label: "Plug-in hybrid" });
    });

    it("give no tag for a figure FINN doesn't list", () => {
        const car = GARAGE.safeCompact();
        const bare = { ...car, consumption: { ...car.consumption, combined: null }, co2: { ...car.co2, value: null } } as unknown as typeof car;

        expect(carTags(bare).map((tag) => tag.id)).toEqual(["fuel"]);
    });
});
