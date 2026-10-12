import type { FinnApiConfig, PinnedFinnCar } from "@/lib/types";
import { mapFinnConfigToAll } from "@/entrypoints/content/manipulateApiData";

import snapshot from "./finn-fleet-snapshot.json";

/**
 * FINN's real inventory, as the engine's fleet tests see it.
 *
 * Rebuilt from the committed snapshot (see scripts/snapshot-finn-fleet.mjs)
 * into the shape FINN's API sends, then passed through the same mapper the
 * extension uses — so a test over this data is a test of the mapping too.
 */

interface SnapshotCar {
  features: {
    true: number[];
    values: Record<string, string | number>;
    absent: number[];
  };
  [field: string]: unknown;
}

function toConfig(car: SnapshotCar): FinnApiConfig {
  const { features, ...fields } = car;
  const absent = new Set(features.absent);
  const truthy = new Set(features.true);

  const list: Record<string, boolean | string | number> = {};

  snapshot.featureKeys.forEach((key, index) => {
    if (absent.has(index)) return;

    const value = features.values[String(index)];
    list[key] = value ?? truthy.has(index);
  });

  return {
    ...fields,
    ...termsFromSnapshot(fields),
    brand: { ...(fields.brand as object), picture: { url: "" } },
    color: { id: "", specific: "", color_hex: "" },
    picture: { url: "", type: "" },
    pictures: [],
    closed_features_list: list,
  } as unknown as FinnApiConfig;
}

/**
 * Terms and prices for a snapshot taken before Lens read them.
 *
 * The committed snapshot kept only FINN's down-payment prices. Lens now prices
 * cars with nothing upfront, from `price` and `available_terms`, which that
 * snapshot doesn't have — so without this every car would map to a price of
 * zero. The fleet tests only ever compare cars' prices with each other, which
 * the down-payment list orders the same way, so it stands in for `price`
 * here. A snapshot refreshed with the current script carries the real fields
 * and this passes them through untouched.
 */
function termsFromSnapshot(fields: Record<string, unknown>): Partial<FinnApiConfig> {
  if (fields.price && fields.available_terms) return {};

  const list = ((fields.downpayment_prices as { available_price_list?: Record<string, number> })
    ?.available_price_list ?? {}) as Record<string, number>;

  const terms = [
    ...new Set(
      Object.keys(list)
        .map((key) => /^b2[bc]_(\d+)$/.exec(key)?.[1])
        .filter(Boolean)
        .map(Number),
    ),
  ];

  return {
    price: list,
    available_terms: terms,
    default_term: fields.default_downpayment_term as number,
    availability_by_term: {},
  };
}

let cached: PinnedFinnCar[] | null = null;

/** Every car in the snapshot, mapped. */
export function fleet(): PinnedFinnCar[] {
  cached ??= Object.values(
    mapFinnConfigToAll((snapshot.cars as SnapshotCar[]).map(toConfig)),
  ).map((car) => ({ ...car, url: "", pinnedAt: "" }));

  return cached;
}

/** When the snapshot was taken, for messages that quote its figures. */
export const FLEET_TAKEN_AT: string = snapshot.takenAt;

/** Lowest advertised private monthly price, for grouping comparable cars. */
export function monthlyPrice(car: PinnedFinnCar): number {
  return car.pricing.customerMonthly.price;
}
