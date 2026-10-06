import { EU_ELECTRICITY_SOURCE } from "@/lib/reasoning-engine/eu-electricity";

/**
 * Where every figure or rule Lens uses that isn't FINN's comes from: named
 * and linked wherever it's said, so a reader can check it — and see Lens's
 * limits for themselves. Each link was checked when it was added; each note
 * says what Lens takes from it.
 */
export interface Source {
    name: string;
    url: string;
}

export const SOURCES = {
    /** The A–G CO₂ classes, and that class A is 0 g/km. */
    co2Label: {
        name: "Pkw-EnVKV — Germany's CO₂ labelling rules for new cars",
        url: "https://www.gesetze-im-internet.de/pkw-envkv/",
    },
    /** A plug-in hybrid's official electricity figure, for each car registered. */
    euRegistrations: { name: EU_ELECTRICITY_SOURCE.name, url: EU_ELECTRICITY_SOURCE.url },
    /** Plug-ins registered in 2021: real-world CO₂ about 3.5 times the official figure, before the 2025 rules. */
    realWorldGap: {
        name: "European Commission — real-world CO₂ emissions gap report, SWD(2024) 59",
        url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A52024SC0059",
    },
    /** New cars that burn fuel, about 134–137 g/km, 2021–2024: the 136 g/km comparison point. */
    icctFleet: {
        name: "ICCT — CO₂ emissions from new passenger cars in Europe, 2024 (from EEA data)",
        url: "https://theicct.org/wp-content/uploads/2025/12/ID-482-%E2%80%93-EEA-briefing-Research-Brief-A4-70179-v7.pdf",
    },
    /** 16.2 kWh/100 km for medium electric cars sold in 2023: the 17 kWh/100 km reference. */
    icctLifeCycle: {
        name: "ICCT — life-cycle greenhouse gas emissions from passenger cars, 2025 (Table 4)",
        url: "https://theicct.org/wp-content/uploads/2025/07/ID-392-%E2%80%93-Life-cycle-GHG_report_final.pdf",
    },
} satisfies Record<string, Source>;
