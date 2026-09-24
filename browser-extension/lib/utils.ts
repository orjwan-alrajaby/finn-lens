import toast from "react-hot-toast";
import type { ActionType, PinnedFinnCar } from "./types";

function pluralize(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

const TIME_AGO_UNITS = [
  { seconds: 86_400, label: "day" },
  { seconds: 3_600, label: "hr" },
  { seconds: 60, label: "min" },
] as const;

export function calculateTimeAgo(isoString: string) {
  const pastTs = new Date(isoString).getTime();
  if (Number.isNaN(pastTs)) return "Just now";

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - pastTs) / 1000));

  for (const { seconds, label } of TIME_AGO_UNITS) {
    const interval = Math.floor(elapsedSeconds / seconds);
    if (interval >= 1) return `${pluralize(interval, label)} ago`;
  }

  return "Just now";
}

export function sortAndSlicePinnedCars(cars: Record<number, PinnedFinnCar> = {}) {
  return Object.values(cars).sort(
    (a, b) => Date.parse(b.pinnedAt) - Date.parse(a.pinnedAt)
  );
}

export function addTimeToDate(
  dateString: string,
  amount: number,
  duration: "hours" | "days" | "weeks" | "months" | "years"
) {
  if (!dateString || typeof amount !== "number") return;

  const date = new Date(dateString);

  switch (duration) {
    case "hours":
      date.setUTCHours(date.getUTCHours() + amount);
      break;
    case "days":
      date.setUTCDate(date.getUTCDate() + amount);
      break;
    case "weeks":
      date.setUTCDate(date.getUTCDate() + amount * 7);
      break;
    case "months":
      date.setUTCMonth(date.getUTCMonth() + amount);
      break;
    case "years":
      date.setUTCFullYear(date.getUTCFullYear() + amount);
      break;
    default:
      throw new Error(`Unsupported duration unit: ${duration}`);
  }

  return date.toISOString();
}

/**
 * Open one of the extension's own pages, from wherever asked.
 *
 * There were two of these — this one and a copy under the popup entrypoint,
 * which is the one every caller happened to import, so the compare page, the
 * pins page and Settings all reached across into `../popup/utils` for a
 * function that has nothing to do with the popup. One lives here now, where
 * anything may use it.
 *
 * The background script is what actually opens the tab, so a failure here
 * means the message never landed. That is worth a toast rather than a
 * silence: the reader pressed something and nothing happened.
 */
export const openBrowserTab = async (
  actionType: ActionType,
  /**
   * The pinned car to open the breakdown of, for `OPEN_PINS_PAGE`. Ignored
   * by every other page.
   */
  options: { carId?: number; tab?: string } = {},
) => {
  const PAGE_NAME: Record<ActionType, string> = {
    OPEN_COMPARE_PAGE: "compare",
    OPEN_SETTINGS_PAGE: "settings",
    OPEN_ONBOARDING_PAGE: "setup",
    OPEN_PINS_PAGE: "pinned cars",
  };

  try {
    await browser.runtime.sendMessage({ type: actionType, ...options });
  } catch {
    toast.error(
      `Something went wrong. Couldn't open the "${PAGE_NAME[actionType]}" page.`,
    );
  }
};
