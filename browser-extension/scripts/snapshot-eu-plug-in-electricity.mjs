/**
 * Builds the table of official electricity figures for plug-in hybrids, from
 * the EU's own registration data.
 *
 * FINN lists a plug-in hybrid's official CO₂ and fuel figures but not the
 * electricity half of the same official test, so Lens can't price what it
 * charges on. Every new car registered in the EU is reported, with that
 * figure, to the European Environment Agency under Regulation (EU) 2019/631;
 * for a plug-in hybrid it is "Electric energy consumption (EC_AC,weighted)",
 * from point 5.2 of its certificate of conformity (Implementing Regulation
 * (EU) 2020/683). This script reads those reports and keeps, for each maker
 * FINN sells, every distinct model name, CO₂ figure and fuel figure with the
 * electricity figures registered against them — so a FINN car can be matched
 * on make, model, CO₂ and fuel figure, and nothing else.
 *
 * Only cars registered in 2025: FINN's figures follow the EU's 2025 rules for
 * plug-in hybrids (Euro 6e-bis), and a 2024 car's figures were worked out
 * under the earlier ones, so a match across the two would pair figures that
 * don't belong together. The 2025 data is provisional until the EEA
 * finalises it; the table records which release it came from.
 *
 * Run with: node scripts/snapshot-eu-plug-in-electricity.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "lib/reasoning-engine/data/eu-plug-in-electricity.json");
const fleet = join(root, "lib/reasoning-engine/test-data/finn-fleet-snapshot.json");

const API = "https://discodata.eea.europa.eu/sql";
const TABLE = "co2cars_2025Pv31";
const PAGE = 5000;

/** "B M W", "MERCEDES-BEZN", "LYNK&AMPCO" — the reports spell makers many ways; FINN one. */
const compact = (text) => String(text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function fetchAll() {
    const query =
        `SELECT Mk, Cn, [Ewltp (g/km)] AS co2, Fc AS fuel, [Z (Wh/km)] AS wh, COUNT(*) AS registrations ` +
        `FROM [CO2Emission].[latest].[${TABLE}] WHERE Fm='P' AND [Z (Wh/km)] IS NOT NULL ` +
        `GROUP BY Mk, Cn, [Ewltp (g/km)], Fc, [Z (Wh/km)] ORDER BY Mk, Cn`;
    const rows = [];

    for (let page = 1; ; page += 1) {
        const url = `${API}?${new URLSearchParams({ query, p: String(page), nrOfHits: String(PAGE) })}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`EEA returned ${response.status}`);

        const body = await response.json();
        if (body.errors) throw new Error(JSON.stringify(body.errors));

        rows.push(...body.results);
        if (body.results.length < PAGE) return rows;
    }
}

/** FINN's makers, from its own fleet: the only ones a match can ever be for. */
function finnMakers() {
    const snapshot = JSON.parse(readFileSync(fleet, "utf8"));
    const cars = Array.isArray(snapshot.cars) ? snapshot.cars : Object.values(snapshot.cars);
    return [...new Set(cars.map((car) => car.brand?.id).filter(Boolean))];
}

/** The FINN maker a report's maker is: "MERCEDES-AMG" and "MERCEDES" are Mercedes-Benz, "M G" is MG. */
function makerFor(reported, makers) {
    const key = compact(reported);
    if (!key) return null;
    if (key.startsWith("MERCEDES")) return makers.includes("Mercedes-Benz") ? "Mercedes-Benz" : null;

    return makers.find((maker) => key === compact(maker) || key.startsWith(compact(maker))) ?? null;
}

const rows = await fetchAll();
const makers = finnMakers();
const table = {};

for (const row of rows) {
    const maker = makerFor(row.Mk, makers);
    if (!maker || row.co2 == null || row.fuel == null || !(row.wh > 0)) continue;

    const key = `${compact(row.Cn)}|${row.co2}|${Number(row.fuel).toFixed(1)}`;
    const entries = (table[maker] ??= {});
    const entry = (entries[key] ??= { model: compact(row.Cn), co2: row.co2, fuel: Number(Number(row.fuel).toFixed(1)), wh: [], registrations: 0 });

    if (!entry.wh.includes(row.wh)) entry.wh.push(row.wh);
    entry.registrations += row.registrations;
}

const out = {
    source: {
        name: "European Environment Agency — CO₂ emissions from new passenger cars, 2025 (provisional)",
        url: "https://www.eea.europa.eu/data-and-maps/data/co2-cars-emission-18",
        release: TABLE,
        regulation: "Regulation (EU) 2019/631",
        field: "Electric energy consumption (EC_AC,weighted), Wh/km",
        fetched: new Date().toISOString().slice(0, 10),
    },
    /* Per maker: [model, CO₂ g/km, fuel L/100 km, [electricity Wh/km…]], the electricity figures sorted. */
    makers: Object.fromEntries(
        Object.entries(table).map(([maker, entries]) => [
            maker,
            Object.values(entries)
                .filter((entry) => entry.registrations > 0)
                .map((entry) => [entry.model, entry.co2, entry.fuel, entry.wh.sort((a, b) => a - b)]),
        ]),
    ),
};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out));

const variants = Object.values(out.makers).reduce((sum, list) => sum + list.length, 0);
console.log(`Kept ${variants} plug-in variants for ${Object.keys(out.makers).length} of FINN's makers, from ${rows.length} rows of ${TABLE}.`);
