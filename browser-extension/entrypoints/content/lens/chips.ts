import { activeChat } from "@/lib/chats/store";
import type { Verdict } from "@/lib/chats/types";

import { CARD_SELECTORS, cardConfigId, cardName, cardPhoto } from "../page/currentCar";
import { brandMark } from "../page/dom";

import { openDrawer } from "./drawer";

/**
 * The chat's verdict, on FINN's own cards.
 *
 * Nothing goes on a card until the chat has judged. A chip is a reading of a
 * judgement, never a judgement of its own, so before there is one there is
 * nothing honest to put there. After it, every car the chat judged carries its
 * verdict and its place, and the one it picked wears a gold chip with a
 * trophy. Clicking a chip opens the drawer on that car — for the gold one,
 * the whole case for it.
 *
 * Each chip lives in a shadow root of its own, with its own few lines of CSS:
 * the card is FINN's, and neither page's styles should reach the other's.
 */

const HOOK = "data-finn-lens-chip";
/** Marks a photo block this file made into a positioning context, so it can undo it. */
const ANCHORED = "data-finn-lens-anchored";

let state: { chatId: string; at: string; verdicts: Record<number, Verdict> } | null = null;

const CSS = `
  :host { all: initial; position: absolute; left: 8px; bottom: 8px; z-index: 10; max-width: calc(100% - 16px); }
  button {
    all: unset; box-sizing: border-box; cursor: pointer;
    display: flex; align-items: center; gap: 6px; max-width: 100%;
    padding: 4px 10px 4px 4px; border-radius: 9999px;
    font: 800 11px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 0 0 1px #fff, 0 1px 6px rgba(0,0,0,.14);
    transition: box-shadow .15s ease, transform .15s ease;
  }
  button:hover { box-shadow: 0 0 0 1px #fff, 0 2px 12px rgba(0,0,0,.22); transform: translateY(-1px); }
  button:focus-visible { outline: 2px solid #0072ea; outline-offset: 2px; }
  .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rank { font-weight: 700; opacity: .7; }
  .why { flex-shrink: 0; padding-left: 6px; border-left: 1px solid currentColor; border-left-color: color-mix(in srgb, currentColor 30%, transparent); font-weight: 700; opacity: .75; }
  .strong  { background: #eaf4ff; color: #0072ea; }
  .good    { background: #ecfdf5; color: #047857; }
  .partial { background: #fff7ed; color: #b45309; }
  .limited { background: #fff1f2; color: #c70036; }
  .unknown { background: #f3f3f3; color: #707070; }
  .winner {
    background: linear-gradient(135deg, #fff3c4 0%, #fcd34d 45%, #f59e0b 100%);
    color: #5b3a00; padding-left: 5px;
    box-shadow: 0 0 0 1px #fff, 0 0 0 3px rgba(245,158,11,.35), 0 2px 10px rgba(180,110,0,.35);
  }
  .winner:hover { box-shadow: 0 0 0 1px #fff, 0 0 0 3px rgba(245,158,11,.5), 0 3px 14px rgba(180,110,0,.45); }
  .trophy {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 18px; height: 18px; border-radius: 9999px; background: #fff; color: #b7791f;
    box-shadow: 0 1px 2px rgba(0,0,0,.15);
  }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } button:hover { transform: none; } }
`;

const TROPHY =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';

/** Said beside the verdict when a ranked car is past one of the reader's limits. */
const OVER: Record<NonNullable<Verdict["over"]>, string> = {
    budget: "over budget",
    period: "term doesn't fit",
};

function chipFor(carId: number, verdict: Verdict, chatId: string, name: string | undefined): HTMLElement {
    const host = document.createElement("span");
    host.setAttribute(HOOK, `${chatId}:${state?.at}:${carId}`);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;

    const button = document.createElement("button");
    button.type = "button";

    const label = document.createElement("span");
    label.className = "label";

    if (verdict.winner) {
        button.className = "winner";

        const trophy = document.createElement("span");
        trophy.className = "trophy";
        trophy.innerHTML = TROPHY;

        label.textContent = "Best for you";
        button.append(trophy, label);
        button.setAttribute("aria-label", `Lens's best match for you${name ? `: ${name}` : ""}. See why it won.`);
    } else {
        button.className = verdict.setAside ? "unknown" : verdict.band;
        label.textContent = verdict.over ? `${verdict.label} · ${OVER[verdict.over]}` : verdict.label;
        button.append(brandMark(16), label);

        if (verdict.rank != null) {
            const rank = document.createElement("span");
            rank.className = "rank";
            rank.textContent = `#${verdict.rank}`;
            button.append(rank);
        }

        button.setAttribute(
            "aria-label",
            `Lens: ${label.textContent}${verdict.rank != null ? `, number ${verdict.rank}` : ""}${name ? ` for ${name}` : ""}. See how it fits you.`,
        );
    }

    if (verdict.setAside) button.title = verdict.setAside;

    const why = document.createElement("span");
    why.className = "why";
    why.setAttribute("aria-hidden", "true");
    why.textContent = "Why ›";
    button.append(why);

    /*
     * FINN's card is a link, and every part of it is clickable. Without this,
     * asking Lens about a car would navigate away from the page the reader was
     * scanning.
     */
    host.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        void openDrawer(chatId, carId);
    });

    shadow.append(style, button);

    return host;
}

/** The photo block has to be a positioning context for the chip to sit in its corner. */
function anchor(photo: HTMLElement): void {
    if (getComputedStyle(photo).position !== "static") return;

    photo.style.position = "relative";
    photo.setAttribute(ANCHORED, "");
}

/**
 * Puts the active chat's verdicts on the cards drawn now, and takes off any
 * that no longer apply. Synchronous and cheap, so it can run on every redraw
 * FINN makes.
 */
export function paintChips(): void {
    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTORS)) {
        const id = cardConfigId(card);
        const photo = cardPhoto(card);
        const existing = photo.querySelector<HTMLElement>(`:scope > [${HOOK}]`);
        const verdict = id != null && state ? state.verdicts[id] : undefined;

        if (!verdict || !state || id == null) {
            existing?.remove();
            continue;
        }

        const key = `${state.chatId}:${state.at}:${id}`;

        if (existing?.getAttribute(HOOK) === key) continue;

        existing?.remove();
        anchor(photo);
        photo.append(chipFor(id, verdict, state.chatId, cardName(card)));
    }
}

/** Reads which chat is active and what it judged, then repaints. */
export async function refreshChips(): Promise<void> {
    const chat = await activeChat();

    state = chat?.judgement ? { chatId: chat.id, at: chat.judgement.at, verdicts: chat.judgement.verdicts } : null;

    paintChips();
}

export function removeChips(): void {
    for (const chip of document.querySelectorAll(`[${HOOK}]`)) chip.remove();

    for (const photo of document.querySelectorAll<HTMLElement>(`[${ANCHORED}]`)) {
        photo.style.position = "";
        photo.removeAttribute(ANCHORED);
        if (!photo.getAttribute("style")) photo.removeAttribute("style");
    }
}
