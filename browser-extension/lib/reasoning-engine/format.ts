/**
 * Shared number formatting.
 *
 * Lives on its own so the calculation modules can build fact strings without
 * importing anything from the presentation layer.
 */

/**
 * English number style, to match the English copy around it: a dot for
 * decimals and a comma for thousands, so "5.8 L/100km" and "1,000 km".
 */
const LOCALE = "en-GB";

export function formatEUR(value: number): string {
  return `€${Math.round(value).toLocaleString(LOCALE)}`;
}

export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** A per-unit price — always two decimals, so €0.20/km never reads as €0.2. */
export function formatPrice(value: number): string {
  return `€${value.toLocaleString(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatKm(value: number): string {
  return `${Math.round(value).toLocaleString(LOCALE)} km`;
}

/** "safety, comfort and practicality" */
export function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] as string;

  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
