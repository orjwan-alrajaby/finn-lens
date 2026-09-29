import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";

import { clearHighlight, configurationCard, highlightConfiguration } from "./highlight";

/**
 * Marking the car the panel is describing, on FINN's own page.
 *
 * The mark lands on the photograph rather than on the whole card: the photo is
 * what a reader recognises a car by, and tinting it says "this one" without
 * the ring-around-everything look that reads as an error as often as a
 * selection.
 *
 * Three things to hold. One car is marked at a time, because the panel talks
 * about one at a time. It works on both kinds of card, because the panel can
 * be opened from a listing as well as from a detail page. And it all comes off
 * again — the mark lives on somebody else's element.
 */

const card = (id: string, attrs: string, name: string) => `
  <div ${attrs} class="w-[303px] relative">
    <div class="group relative flex size-full flex-col overflow-hidden">
      <div class="bg-snow relative rounded" data-photo="${id}">
        <img alt="${name}">
      </div>
      <p>${name}</p>
    </div>
    <button class="finn-lens-add-car-btn"></button>
  </div>
`;

const configurationCardMarkup = (id: number, name: string) => `
  <div id="product-${id}" class="group bg-snow overflow-hidden relative">
    <div class="relative px-4 pt-4" data-photo="${id}">
      <img alt="${name}">
      <button class="finn-lens-add-car-btn absolute top-4 right-4"></button>
    </div>
    <p>${name}</p>
  </div>
`;

const page = `
  <div data-appid="product-details">
    <div data-testid="group-comparison">
      ${configurationCardMarkup(36918, "Boost")}
      ${configurationCardMarkup(34889, "Comfort")}
    </div>
  </div>
  ${card("36933", 'data-testid="product-card" data-productid="byd-dolphin-36933-black"', "BYD Dolphin")}
`;

let document: Document;
let scrolled: string[];

beforeEach(() => {
  const { document: rendered, window } = parseHTML(
    `<!doctype html><html><head></head><body>${page}</body></html>`,
  );

  scrolled = [];

  for (const photo of rendered.querySelectorAll("[data-photo]")) {
    (photo as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {
      scrolled.push((photo as Element).getAttribute("data-photo") as string);
    };
  }

  Object.assign(globalThis, { document: rendered, window });

  document = rendered as unknown as Document;
});

afterEach(() => {
  clearHighlight();
});

const marked = () => document.querySelectorAll(".finn-lens-current");
const photoOf = (id: number) => document.querySelector(`[data-photo="${id}"]`);

describe("configurationCard", () => {
  it("points at the photograph, which is what gets marked", () => {
    expect(configurationCard(34889)).toBe(photoOf(34889));
  });

  it("is empty for a car this page doesn't show", () => {
    expect(configurationCard(99999)).toBeNull();
  });
});

describe("highlightConfiguration", () => {
  it("marks the photo of the car the panel is describing", () => {
    highlightConfiguration(34889);

    expect(marked()).toHaveLength(1);
    expect(marked()[0]).toBe(photoOf(34889));
  });

  it("marks a listing card, which identifies itself differently", () => {
    /*
     * A configuration card carries its id in `id="product-34889"`; a listing
     * card carries it inside `data-productid`. The panel opens from either.
     */
    highlightConfiguration(36933);

    expect(marked()[0]).toBe(photoOf(36933));
  });

  it("marks one at a time, because the panel describes one at a time", () => {
    highlightConfiguration(34889);
    highlightConfiguration(36918);

    expect(marked()).toHaveLength(1);
    expect(marked()[0]).toBe(photoOf(36918));
  });

  it("clears the mark when the reader goes back to the list", () => {
    highlightConfiguration(34889);
    highlightConfiguration(null);

    expect(marked()).toHaveLength(0);
  });

  it("tints rather than outlines, so nothing moves", () => {
    highlightConfiguration(34889);

    const css =
      document.getElementById("finn-lens-highlight-style")?.textContent ?? "";

    expect(css).toContain("background-color");
    expect(css).not.toContain("box-shadow");
    expect(css).not.toContain("border");
  });

  /*
   * Marking used to be able to scroll, for the panel's configuration chooser:
   * picking a car there was a request to be shown it. The chooser is gone and
   * the badge is the only way in, so the reader is always already looking at
   * the card — moving the page under them would now never be asked for, and
   * this is the test that says the ability went away with the caller.
   */
  it("never moves the page", () => {
    highlightConfiguration(34889);
    highlightConfiguration(36918);
    highlightConfiguration(34889);

    expect(scrolled).toEqual([]);
  });

  it("doesn't re-mark on a repaint that changes nothing", () => {
    highlightConfiguration(34889);
    const style = document.getElementById("finn-lens-highlight-style");

    highlightConfiguration(34889);

    expect(document.getElementById("finn-lens-highlight-style")).toBe(style);
  });

  it("leaves the page alone for a car it can't find", () => {
    const before = document.documentElement.outerHTML;

    highlightConfiguration(99999);

    expect(document.documentElement.outerHTML).toBe(before);
  });

  it("gives everything back", () => {
    const before = document.documentElement.outerHTML;

    highlightConfiguration(34889);
    clearHighlight();

    expect(document.documentElement.outerHTML).toBe(before);
  });

  it("clears a page that was never marked without complaint", () => {
    const before = document.documentElement.outerHTML;

    clearHighlight();

    expect(document.documentElement.outerHTML).toBe(before);
  });
});
