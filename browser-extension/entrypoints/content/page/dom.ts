/**
 * The smallest thing that can build Lens's furniture on finn.com.
 *
 * Everything the reader reads is React, in extension pages framed into the
 * page. What the content script draws itself — the bubble, the drawer's shell,
 * the chips — is a handful of elements, and a rendering library for those
 * would be most of a megabyte on every finn.com page.
 */

import { BRAND_IDLE_SPIN_ON_PAGE } from "@/lib/brand-spinner";

type Child = Node | string | null | undefined | false;

interface Options {
  class?: string;
  /** Always text, never markup — every string here escapes on the way in. */
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: Options = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.class) node.className = options.class;
  if (options.text != null) node.textContent = options.text;

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }

  for (const [event, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(event, handler as EventListener);
  }

  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child);
  }

  return node;
}

/**
 * Lens's own mark, for the places that have to say whose they are.
 *
 * On finn.com a chip over FINN's photograph reads as FINN's unless it says
 * otherwise, and the claim it makes is Lens's, ranked against what this reader
 * said. The mark on a white disc is the cheapest way to say so, and the disc
 * gives it the same ground whatever it lands over.
 *
 * Styled inline: the chips hang in FINN's own cards, where a page rule as
 * ordinary as `.card img { width: 100% }` would outrank a utility class.
 * `alt` is empty because every caller already names Lens in its own label.
 */
export function brandMark(
  size: number,
  className = "",
  { idle = false }: { idle?: boolean } = {},
): HTMLElement {
  const disc = document.createElement("span");
  const img = document.createElement("img");

  /*
   * Reachable from finn.com only because `icon/*` is a web-accessible
   * resource; see wxt.config.ts. Without that the browser blocks it and
   * these controls lose their mark with nothing in its place.
   */
  img.src = browser.runtime.getURL("/icon/128.png");
  img.alt = "";
  img.setAttribute("aria-hidden", "true");

  /*
   * Styled inline rather than by utility classes, which is the one thing here
   * that is not a style preference. The badge hangs in FINN's own card in the
   * light DOM, so FINN's stylesheet reaches it, and a listing rule as ordinary
   * as `.card img { width: 100% }` outranks `w-3` on specificity and would
   * blow the mark up to the width of the photograph. An inline declaration is
   * the one thing a page rule cannot outrank without `!important`.
   *
   * `size` is the disc, in px — the whole object, so callers size the thing
   * they are actually placing. The artwork is inset to 0.8 of it, which is
   * the same proportion as the 20-in-24 on the onboarding screen; the ring of
   * white left around it is what keeps the aperture from touching the edge
   * and reading as a cropped circle rather than a mark on a disc.
   */
  const inner = Math.round(size * 0.8);

  disc.className = className;
  disc.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    `width:${size}px`,
    `height:${size}px`,
    "flex-shrink:0",
    "border-radius:9999px",
    "background:#fff",
    /* Tailwind's own `shadow-sm`, spelled out — the panel is in a shadow root
       and the badge is on FINN's page, and neither can rely on a class here. */
    "box-shadow:0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  ].join(";");

  /*
   * Turning over slowly, where the mark stands alone.
   *
   * The icon is a wheel, and a wheel at rest in a product about cars is a
   * wheel that looks stuck. The floating button that opens the chat asks for
   * it; the chips on FINN's cards don't, since a listing page carries forty of
   * them and each would be a wheel turning on somebody else's site. It stays
   * opt-in so a new caller decides deliberately. At fourteen seconds a revolution
   * that reads as idling rather than activity, and it stops under
   * `prefers-reduced-motion`.
   *
   * Only the artwork turns, never the white disc under it. A rotating disc is
   * indistinguishable from a still one and its shadow would swing.
   *
   * Not `BRAND_IDLE_SPIN`'s utilities: on the badge, in FINN's light DOM, the
   * page's stylesheet outranked them and the wheel spun at loader speed.
   */
  if (idle) img.className = BRAND_IDLE_SPIN_ON_PAGE;

  img.style.cssText = [
    `width:${inner}px`,
    `height:${inner}px`,
    "flex-shrink:0",
    "object-fit:contain",
    /* FINN sets `img { display: block }` in places; the disc centres either
       way, but this keeps the box from picking up a text baseline gap. */
    "display:block",
  ].join(";");

  disc.append(img);

  return disc;
}

/**
 * The stylesheet the extension already builds, put inside a shadow root.
 *
 * The content script's CSS is a full Tailwind build including a reset, so it
 * is never put on finn.com itself (`cssInjectionMode: "manual"`). Inside a
 * shadow root none of it can reach the page, and Tailwind v4 declares its
 * theme on `:root, :host` so the tokens still resolve.
 *
 * Fetched once and cached for the life of the page.
 */
let stylesheet: Promise<string> | null = null;

export function panelStyles(): Promise<string> {
  /*
   * Not one of the entrypoints WXT generates a path type for — it's the CSS
   * the content script itself is built with, listed as a web-accessible
   * resource in wxt.config.ts so it can be fetched from here.
   */
  const href = browser.runtime.getURL(
    "/content-scripts/content.css" as never,
  );

  stylesheet ??= fetch(href)
    .then((response) => response.text())
    .catch((error: unknown) => {
      console.error("[FinnLens] couldn't load panel styles", error);
      return "";
    });

  return stylesheet;
}
