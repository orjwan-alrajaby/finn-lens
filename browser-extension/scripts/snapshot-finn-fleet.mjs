/**
 * Takes a snapshot of FINN's available cars for the engine's fleet tests.
 *
 * The scoring model's thresholds — which equipment is baseline, where the
 * length and range curves bend, whether a profile keeps its promise — are
 * calibrated against what FINN actually rents, not against invented cars. The
 * tests that hold them there must not reach the network, so they read this
 * committed copy instead, and this script is how the copy is refreshed.
 *
 * It keeps only the fields `mapFinnConfig` reads, so the snapshot exercises
 * the real mapper, and it stores each equipment list as indices into one
 * shared key table rather than repeating fifty German names per car.
 *
 * Run with: node scripts/snapshot-finn-fleet.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "lib/reasoning-engine/test-data/finn-fleet-snapshot.json");

const SOURCE =
  "https://www.finn.com/api/cars?hide_related=true&pricing_type=downpayment&view=available_cars";

const PAGE = 50;

async function fetchAll() {
  const cars = [];

  for (let offset = 0; ; offset += PAGE) {
    const response = await fetch(`${SOURCE}&limit=${PAGE}&offset=${offset}`, {
      headers: { "x-finn-actor": "ua_frontend", "x-language-tag": "de-DE" },
    });

    if (!response.ok) throw new Error(`FINN API returned ${response.status}`);

    const { results } = await response.json();
    cars.push(...results);

    if (results.length < PAGE) return cars;

    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

const raw = await fetchAll();

const featureKeys = [
  ...new Set(raw.flatMap((car) => Object.keys(car.closed_features_list ?? {}))),
].sort();

const cars = raw.map((car) => {
  const list = car.closed_features_list ?? {};
  const term = car.default_downpayment_term;

  return {
    config_id: car.config_id,
    brand: { id: car.brand?.id },
    model: car.model,
    model_year: car.model_year,
    engine: car.engine,
    equipment_line: car.equipment_line,
    trim_name: car.trim_name,
    fuel: car.fuel,
    gearshift: car.gearshift,
    config_drive: car.config_drive,
    cartype: car.cartype,
    power: car.power,
    seats: car.seats,
    doors: car.doors,
    default_downpayment_term: term,
    /* The no-down-payment price per term, and the terms and delivery windows on offer. */
    available_terms: car.available_terms,
    default_term: car.default_term,
    price: Object.fromEntries(
      Object.entries(car.price ?? {}).filter(([key]) => /^b2[bc]_\d+$/.test(key)),
    ),
    availability_by_term: car.availability_by_term,
    downpayment_prices: {
      msrp: car.downpayment_prices?.msrp,
      available_price_list: car.downpayment_prices?.available_price_list,
      extra_km_price: car.downpayment_prices?.extra_km_price,
    },
    consumption: car.consumption,
    consumption_city: car.consumption_city,
    consumption_highway: car.consumption_highway,
    co2emission: car.co2emission,
    co2_class: car.co2_class,
    ev_range: car.ev_range,
    vehicle_size: car.vehicle_size,
    is_refurbished: car.is_refurbished,
    has_hitch: car.has_hitch,
    tires: car.tires,
    features: {
      /* Indices into `featureKeys` of entries that are `true`. */
      true: featureKeys.flatMap((key, index) => (list[key] === true ? [index] : [])),
      /* Entries carrying a value rather than a yes or no. */
      values: Object.fromEntries(
        featureKeys.flatMap((key, index) =>
          typeof list[key] === "string" || typeof list[key] === "number"
            ? [[index, list[key]]]
            : [],
        ),
      ),
      /*
       * Indices of keys this car's list doesn't carry at all. Every other key
       * not in `true` or `values` is present and `false`.
       */
      absent: featureKeys.flatMap((key, index) => (key in list ? [] : [index])),
    },
  };
});

mkdirSync(dirname(target), { recursive: true });

writeFileSync(
  target,
  JSON.stringify({
    takenAt: new Date().toISOString().slice(0, 10),
    source: SOURCE,
    featureKeys,
    cars,
  }),
);

console.log(`Wrote ${cars.length} cars (${featureKeys.length} equipment keys) to ${target}`);
