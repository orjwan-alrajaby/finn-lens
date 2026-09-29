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
