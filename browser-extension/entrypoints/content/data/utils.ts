/*
 * Five digits or more. Today's ids are five, but `\d{5}` would silently drop
 * a sixth — while `cardConfigId` reads the whole run, so the pin and the
 * badge on one card would name different cars.
 */
const CONFIG_ID_PATTERN = /\d{5,}/;

export function extractConfigId(inputValue: string): number | null {
  const match = inputValue.match(CONFIG_ID_PATTERN);
  return match ? parseInt(match[0], 10) : null;
}

export function isConfigCardId(id: string): boolean {
  return CONFIG_ID_PATTERN.test(id);
}

/** Builds a car URL with `selected_config` set (added or overwritten). Falls
 * back to the raw base URL if it isn't a valid absolute URL. */
export function buildCarUrl(baseUrl: string, carConfigId: number): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("selected_config", String(carConfigId));
    return url.toString();
  } catch {
    return baseUrl;
  }
}
