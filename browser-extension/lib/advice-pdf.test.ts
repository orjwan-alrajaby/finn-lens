import { describe, expect, it } from "vitest";

import {
  adviceFileName,
  advicePdfOptions,
  placeLinks,
  type LinkRect,
} from "./advice-pdf";

/**
 * The file the reader ends up with.
 *
 * Its name is the only part of the export they see before opening it, and
 * the only part that has to survive being dropped in a folder with eleven
 * others.
 */

describe("adviceFileName", () => {
  const day = new Date(2026, 8, 5);

  it("names the car and the day it was true", () => {
    expect(adviceFileName("BYD Dolphin", day)).toBe(
      "finn-lens-advice-byd-dolphin-2026-09-05.pdf",
    );
  });

  /* A folder of these sorts itself, which a localised date would not. */
  it("pads the date so a folder of them sorts", () => {
    expect(adviceFileName("Ora", new Date(2026, 0, 9))).toContain("2026-01-09");
  });

  it("survives everything a model name puts in a filename", () => {
    expect(adviceFileName("Citroën ë-C4 (Shine+)", day)).toBe(
      "finn-lens-advice-citro-n-c4-shine-2026-09-05.pdf",
    );
  });

  it("leaves no stray dashes at either end", () => {
    const name = adviceFileName("...MG4...", day);

    expect(name).toBe("finn-lens-advice-mg4-2026-09-05.pdf");
    expect(name).not.toContain("--");
  });

  /* A car whose name is entirely punctuation still has to produce a file. */
  it("still names something when the car's name reduces to nothing", () => {
    expect(adviceFileName("???", day)).toBe("finn-lens-advice-2026-09-05.pdf");
  });
});

describe("advicePdfOptions", () => {
  /*
   * Built, not saved: the document comes back so the link annotations can be
   * laid over it before it reaches the disk.
   */
  it("hands the document back rather than saving it", () => {
    const options = advicePdfOptions("x.pdf");

    expect(options.filename).toBe("x.pdf");
    expect(options.method).toBe("build");
  });

  /*
   * The car's photograph comes from FINN's CDN. Without this the capture
   * leaves a hole where the car was, which is the one thing on the page a
   * reader would notice missing at a glance.
   */
  it("asks for the car's photograph across origins", () => {
    const options = advicePdfOptions("x.pdf");

    expect(options.canvas?.useCORS).toBe(true);
    expect(options.overrides?.canvas?.useCORS).toBe(true);
  });

  /*
   * Margins would otherwise come out black, which reads as a printing fault.
   * White because the page's own ground is white — the sections are the
   * coloured things on it, not the field behind them. If that inverts again,
   * this has to move with it.
   */
  it("paints the sheet in the page's own ground", () => {
    expect(advicePdfOptions("x.pdf").overrides?.canvas?.backgroundColor).toBe(
      "#ffffff",
    );
  });
});

/**
 * Putting the page's links back on top of the picture of the page.
 *
 * A4 at an 8mm margin, captured from a 1160px-wide page: the numbers below
 * are the ones the real export runs with, so the arithmetic is checked
 * against the case it exists for rather than a convenient one.
 */
describe("placeLinks", () => {
  const geometry = {
    elementWidth: 1160,
    pageWidth: 210,
    pageHeight: 297,
    margin: 8,
  };

  /** The width the capture is squeezed by to fit the sheet. */
  const fit = 1160 / ((210 - 16) * 3.77952755906);

  /** How much of the page, in its own pixels, one sheet holds. */
  const sheet = (297 - 16) * 3.77952755906 * fit;

  const link = (over: Partial<LinkRect> = {}): LinkRect => ({
    url: "https://www.finn.com/de-DE/cars/1",
    x: 0,
    y: 0,
    width: 200,
    height: 40,
    ...over,
  });

  it("puts a link near the top on the first sheet, inside the margin", () => {
    const [placed] = placeLinks([link({ x: 100, y: 50 })], geometry);

    expect(placed?.page).toBe(1);
    expect(placed?.x).toBeCloseTo(8 + 100 / (3.77952755906 * fit), 4);
    expect(placed?.y).toBeCloseTo(8 + 50 / (3.77952755906 * fit), 4);
  });

  /* The whole point of the scaling: a full-width link spans the full sheet. */
  it("scales a full-width link to the sheet's printable width", () => {
    const [placed] = placeLinks([link({ x: 0, width: 1160 })], geometry);

    expect(placed?.width).toBeCloseTo(210 - 16, 4);
  });

  it("counts pages from one, the way jsPDF does", () => {
    const [placed] = placeLinks([link({ y: sheet * 2 + 10 })], geometry);

    expect(placed?.page).toBe(3);
    expect(placed?.y).toBeCloseTo(8 + 10 / (3.77952755906 * fit), 4);
  });

  /*
   * A link lying across a break is placed on both sheets, each clipped to
   * its own — otherwise half the button is dead and nobody can say why.
   */
  it("places a link that straddles a page break on both pages", () => {
    const placed = placeLinks(
      [link({ y: sheet - 20, height: 40 })],
      geometry,
    );

    expect(placed.map((item) => item.page)).toEqual([1, 2]);
    expect(placed[0]?.height).toBeCloseTo(20 / (3.77952755906 * fit), 4);
    expect(placed[1]?.height).toBeCloseTo(20 / (3.77952755906 * fit), 4);
    expect(placed[1]?.y).toBeCloseTo(8, 4);
  });

  /* Hidden for the capture, so there is nothing on the sheet to cover. */
  it("ignores an anchor that was hidden for the export", () => {
    expect(
      placeLinks([link({ width: 0, height: 0 })], geometry),
    ).toEqual([]);
  });

  it("ignores anything a PDF reader could not follow", () => {
    const junk = [
      link({ url: "" }),
      link({ url: "#behind" }),
      link({ url: "javascript:void(0)" }),
      link({ url: "chrome-extension://abc/compare.html" }),
    ];

    expect(placeLinks(junk, geometry)).toEqual([]);
  });

  it("keeps the link's own address", () => {
    const [placed] = placeLinks(
      [link({ url: "https://www.finn.com/de-DE/cars/42" })],
      geometry,
    );

    expect(placed?.url).toBe("https://www.finn.com/de-DE/cars/42");
  });

  /* A page narrower than the sheet is not blown up to fill it. */
  it("leaves a narrow page at its own size", () => {
    const [placed] = placeLinks([link({ x: 100, width: 200 })], {
      ...geometry,
      elementWidth: 400,
    });

    expect(placed?.width).toBeCloseTo(200 / 3.77952755906, 4);
  });
});
