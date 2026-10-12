/**
 * What a row's colour means, wherever a section is drawn as a table.
 *
 * Three sections now draw one: the environmental result, "How much it uses",
 * and — with no figures to compare, but the same shape and the same
 * vocabulary — the tradeoffs and the feature groups. One scale across all of
 * them, so a green edge means the same thing in each and a reader never has to
 * learn a second colour language halfway down a panel.
 *
 * This was `ENVIRONMENT_TONE`, in `environment-copy`, which was accurate while
 * one section used it.
 */
export type RowTone = "success" | "warning" | "caution" | "error" | "info" | "neutral";

/**
 * The colours, beside the words: a 4px edge on the row, the tint of its pills,
 * the same hue as ink for a line of type, the pale ground a whole card can
 * sit on, and the solid fill of a bar. A row's own figures are carried by
 * weight, not colour, so the colour is free to mean one thing.
 *
 * `ink` and `ground` exist for the environmental result's verdict card, where
 * the reading is a phrase rather than a pill — "Moderate emissions", set in
 * the tone's own colour on the tone's own tint. `bar` is the filled part of
 * the comparison bar, which needs the hue solid rather than pale.
 *
 * `deep` is `ink` again wherever `ink` is already dark enough, and darker
 * where it isn't: a 10px caption needs 4.5:1 against what it sits on, and
 * accent blue on pale blue measures 4.11:1 — fine for a mark, short for a
 * label. The method fold's two headings are set in it, on their own tints.
 */
export const ROW_TONE: Record<
  RowTone,
  {
    edge: string;
    pill: string;
    ink: string;
    deep: string;
    ground: string;
    bar: string;
  }
> = {
  success: {
    edge: "border-l-finn-success",
    pill: "bg-finn-influence-emerald-pale text-finn-influence-emerald",
    ink: "text-finn-influence-emerald",
    deep: "text-finn-influence-emerald",
    ground: "bg-finn-influence-emerald-pale",
    bar: "bg-finn-success",
  },
  warning: {
    edge: "border-l-finn-warning",
    pill: "bg-finn-warning-lift text-finn-warning-deep",
    ink: "text-finn-warning-deep",
    deep: "text-finn-warning-deep",
    ground: "bg-finn-warning-lift/50",
    bar: "bg-finn-warning",
  },
  caution: {
    edge: "border-l-finn-influence-orange",
    pill: "bg-finn-influence-orange-pale text-finn-influence-orange",
    ink: "text-finn-influence-orange",
    deep: "text-finn-influence-orange",
    ground: "bg-finn-influence-orange-pale",
    bar: "bg-finn-influence-orange",
  },
  error: {
    edge: "border-l-finn-error",
    pill: "bg-finn-fit-limited-pale text-finn-fit-limited",
    ink: "text-finn-fit-limited",
    deep: "text-finn-fit-limited",
    ground: "bg-finn-fit-limited-pale",
    bar: "bg-finn-error",
  },
  info: {
    edge: "border-l-finn-accent-blue",
    pill: "bg-finn-pale-blue text-finn-accent-blue",
    ink: "text-finn-accent-blue",
    deep: "text-finn-highlight-navy",
    ground: "bg-finn-pale-blue",
    bar: "bg-finn-accent-blue",
  },
  neutral: {
    edge: "border-l-finn-iron/30",
    pill: "bg-finn-cotton text-finn-iron",
    ink: "text-finn-iron",
    deep: "text-finn-iron",
    ground: "bg-finn-snow",
    bar: "bg-finn-iron/40",
  },
};

/**
 * How loudly a compromise is drawn.
 *
 * The engine has already decided which of two weights a tradeoff carries, and
 * it decided it from the reader's own order: losing something on their #1 is a
 * high one, the same loss on their #5 is moderate. Orange for the first and
 * amber for the second — the two steps the CO₂ classes use between "watch
 * this" and "this is a problem", so the panel does not invent a third scale
 * for the same idea.
 *
 * Neither is red. One kind of tradeoff is, edge and pill, and it takes that
 * from `readTradeoff` rather than from here: equipment the reader gave extra
 * influence and the car doesn't have, so it matches that group's red in the
 * feature table.
 */
