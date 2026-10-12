import type { PinnedFinnCar } from "@/lib/types";

import table from "./data/eu-plug-in-electricity.json";

/**
 * A plug-in hybrid's official electricity figure, from the EU's registration
 * data rather than from FINN — which lists the CO₂ and fuel halves of the
 * same official test and not this one.
 *
 * A FINN car is matched on its maker, its official CO₂ and fuel figures
 * exactly as FINN lists them, and its name. Nothing else is inferred: no
 * match is no figure. Where FINN's figures fit more than one version in the
 * EU data with different electricity figures, the highest is used and the
 * range said, since nothing in FINN's data says which version it is.
 *
 * Built by scripts/snapshot-eu-plug-in-electricity.mjs.
 */

export const EU_ELECTRICITY_SOURCE = table.source;

export interface EuElectricity {
    /** kWh per 100 km, the EU's official (weighted) figure — the highest, where versions differ. */
    kWhPer100Km: number;
    /** Where versions FINN's figures fit differ: the lowest and highest, in kWh/100 km. */
    range: [number, number] | null;
    /** The model names in the EU data it was matched to. */
    matchedAs: string[];
}

type Row = [model: string, co2: number, fuel: number, wh: number[]];

const MAKERS = table.makers as unknown as Record<string, Row[]>;

const compact = (text: string | null | undefined) => String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Words that say what kind of car it is, not which: matching on "xDrive" alone paired a 330e with an X1. */
const GENERIC = new Set([
    "XDRIVE", "SDRIVE", "4MATIC", "4MIC", "AWD", "4WD", "PHEV", "HYBRID", "PLUG", "IN", "EHYBRID", "TOURING", "LIMOUSINE", "KOMBI", "SPORTBACK",
    "STEPTRONIC", "AUTOMATIC", "AUT", "DCT", "CVT", "MIT", "EQ", "TECHNOLOGIE", "TECH", "BOOST", "T", "A", "DE", "E", "KLASSE", "ER",
]);

/**
 * The runs of FINN's model and engine words that could name it in the EU's
 * data, compacted as the EU writes them: "E 300 de" → "E300DE", "530e xDrive"
 * → "530E", "530EXDRIVE". A run of generic words alone names nothing.
 */
function nameRuns(car: PinnedFinnCar): string[] {
    const runs = new Set<string>([compact(car.model)]);

    /* The engine, the model, and the two together: "GLA" and "250 e" are "GLA250E", not any 250 e. */
    for (const words of [`${car.engine ?? ""}`, `${car.model ?? ""}`, `${car.model ?? ""} ${car.engine ?? ""}`].map((text) => text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean))) {
        for (let start = 0; start < words.length; start += 1) {
            for (let end = start + 1; end <= Math.min(words.length, start + 3); end += 1) {
                const run = words.slice(start, end);
                if (run.every((word) => GENERIC.has(word))) continue;
                runs.add(run.join(""));
            }
        }
    }

    return [...runs].filter((run) => run.length >= 2 && !/^\d+$/.test(run));
}

export function euElectricityFor(car: PinnedFinnCar): EuElectricity | null {
    if (car.fuelType !== "Plug-in Hybrid") return null;

    const rows = MAKERS[car.brand ?? ""];
    const co2 = car.co2?.value;
    const fuel = car.consumption?.combined;
    if (!rows || co2 == null || fuel == null) return null;

    /* FINN's own figures, exactly: same CO₂, same fuel to the 0.1 L the EU reports. */
    const figures = rows.filter((row) => row[1] === co2 && Math.abs(row[2] - fuel) < 0.051);
    if (!figures.length) return null;

    /*
     * And the name: the versions whose EU name holds the longest run of
     * FINN's own words for it — "E300DE" over "300DE", so an E 300 de isn't
     * a C 300 de. Nothing distinctive in common is no match.
     */
    const runs = nameRuns(car);
    const scored = figures.map((row) => ({ row, score: Math.max(0, ...runs.filter((run) => compact(row[0]).includes(run)).map((run) => run.length)) }));
    const best = Math.max(...scored.map((item) => item.score));
    if (best < 2) return null;

    const matched = scored.filter((item) => item.score === best).map((item) => item.row);
    const wh = [...new Set(matched.flatMap((row) => row[3]))].sort((a, b) => a - b);
    const low = wh[0]! / 10;
    const high = wh[wh.length - 1]! / 10;

    return {
        kWhPer100Km: high,
        range: high > low ? [low, high] : null,
        matchedAs: [...new Set(matched.map((row) => row[0]))],
    };
}
