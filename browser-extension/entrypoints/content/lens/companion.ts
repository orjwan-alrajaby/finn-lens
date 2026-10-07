import type { TipClosed, TipContent } from "@/lib/lens-chat/messages";

import { brandMark, el } from "../page/dom";

import { chatLayer, chatPanel } from "./bubble";
import { token } from "./frames";

/**
 * The "i"'s companion panel: what an answer means, in a small panel of its
 * own beside the chat, on its left — separate from the chat, so it never
 * covers the chips it explains, and joined to it by a hinge level with the
 * "i" that opened it.
 *
 * The chat can't draw outside its own frame, so it hands the content here
 * and this draws it. Where there's no room on the chat's left — a phone's
 * full-width sheet, a narrow window — `showTip` says no, and the chat shows
 * the panel inside itself instead.
 */

const WIDTH = 264;
/** The space between the companion and the chat, which the hinge spans. */
const GAP = 14;
/** At least this much of finn.com shows beside the companion. */
const EDGE = 8;
/** The hinge: a short clip across the gap, reaching this far onto each panel. */
const HINGE_REACH = 7;
const HINGE_HEIGHT = 8;

let box: HTMLElement | null = null;
let hinge: HTMLElement | null = null;
let watching: ResizeObserver | null = null;

/* Lucide's paths, inline: the content script carries no icon library. */
const ICONS = {
    check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>',
};

function icon(markup: string, className: string): HTMLElement {
    const span = el("span", { class: className, attrs: { "aria-hidden": "true" } });
    span.innerHTML = markup;
    return span;
}

/** The same layout as the panel inside the chat: title, why it's starred, what it means, what's checked, a quiet note, sources. */
function contents(tip: TipContent): HTMLElement[] {
    const body = (tip.body ?? []).filter((paragraph): paragraph is string => Boolean(paragraph));
    const lists = (tip.lists ?? []).filter((list) => list.items.length);
    const sources = tip.sources ?? [];

    return [
        ...(tip.recommended
            ? [
                  el("p", { class: "flex gap-1.5 rounded-lg bg-[#fff6d6] px-2.5 py-2 text-[12px] font-semibold leading-snug text-[#8a5a00]" }, [
                      icon(ICONS.star, "mt-0.5 shrink-0"),
                      el("span", { text: tip.recommended }),
                  ]),
              ]
            : []),
        ...body.map((paragraph) => el("p", { class: "text-finn-black/85", text: paragraph })),
        ...lists.map((list) =>
            el("div", {}, [
                el("p", { class: "text-[10px] font-black uppercase tracking-wide text-finn-iron", text: list.label }),
                el(
                    "ul",
                    { class: "mt-1 space-y-1" },
                    list.items.map((item) => el("li", { class: "flex gap-1.5" }, [icon(ICONS.check, "mt-[3px] shrink-0 text-finn-accent-blue"), el("span", { text: item })])),
                ),
                list.hint ? el("p", { class: "mt-1 text-[11.5px] leading-snug text-finn-iron", text: list.hint }) : null,
            ]),
        ),
        ...(tip.note ? [el("p", { class: "text-[11.5px] leading-snug text-finn-iron", text: tip.note })] : []),
        ...(sources.length
            ? [
                  el(
                      "p",
                      { class: "flex flex-wrap gap-x-3 border-t border-finn-cotton pt-2 text-[11px]" },
                      sources.map((source, index) =>
                          el(
                              "a",
                              {
                                  class: "inline-flex items-center gap-0.5 font-bold text-finn-accent-blue underline decoration-finn-accent-blue/30 underline-offset-2 hover:decoration-finn-accent-blue",
                                  text: sources.length > 1 ? `Source ${index + 1}` : "Source",
                                  attrs: { href: source.url, target: "_blank", rel: "noreferrer", "aria-label": `Source: ${source.name} (opens in a new tab)` },
                              },
                              [icon(ICONS.out, "")],
                          ),
                      ),
                  ),
              ]
            : []),
    ];
}

/** Tells the chat its "i" is closed, when the reader closed it here. */
function notifyClosed(): void {
    void browser.runtime.sendMessage({ type: "LENS_TIP_CLOSED", token } satisfies TipClosed).catch(() => {});
}

/** Puts the companion level with the "i" at `y` in the chat frame. False when the "i" is out of the chat's sight. */
function place(y: number): boolean {
    const panel = chatPanel();
    if (!panel || !box || !hinge) return false;

    const chat = panel.getBoundingClientRect();
    if (y < 0 || y > chat.height) return false;

    const level = chat.top + y;

    /* Never taller than the chat it belongs to, and kept within its span: a booth beside it, not a sheet over the page. */
    box.style.maxHeight = `${Math.round(chat.height)}px`;
    const height = box.getBoundingClientRect().height;
    const top = Math.min(Math.max(chat.top, level - 32), chat.bottom - height);

    box.style.left = `${Math.round(chat.left - GAP - WIDTH)}px`;
    box.style.top = `${Math.round(top)}px`;
    hinge.style.left = `${Math.round(chat.left - GAP - HINGE_REACH)}px`;
    hinge.style.top = `${Math.round(Math.min(Math.max(level, top + 20), top + height - 20) - HINGE_HEIGHT / 2)}px`;

    return true;
}

/** Shows `tip` beside the chat, level with its "i". False where there's no room, and the chat shows it itself. */
export function showTip(tip: TipContent, y: number): boolean {
    const panel = chatPanel();
    const layer = chatLayer();

    if (!panel || !layer || panel.style.display === "none" || !window.matchMedia("(min-width: 640px)").matches) return false;
    if (panel.getBoundingClientRect().left - GAP - WIDTH < EDGE) return false;

    hideTip(false);

    const close = el("button", {
        class: "-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-finn-iron transition-colors hover:bg-finn-snow hover:text-finn-black focus-visible:outline-2 focus-visible:outline-finn-accent-blue",
        attrs: { type: "button", "aria-label": "Close" },
        on: { click: () => hideTip(true) },
    });
    close.innerHTML = ICONS.close;

    box = el(
        "aside",
        {
            class: "fixed flex flex-col overflow-hidden rounded-[20px] bg-white font-sans text-left shadow-2xl ring-1 ring-black/5",
            attrs: { role: "dialog", "aria-label": tip.title },
        },
        [
            el("div", { class: "flex shrink-0 items-center gap-2 border-b border-finn-cotton bg-finn-snow/60 px-3.5 py-2.5" }, [
                brandMark(22),
                el("p", { class: "min-w-0 flex-1 text-[13.5px] font-black leading-snug text-finn-black", text: tip.title }),
                close,
            ]),
            el("div", { class: "min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 pt-3 pb-3.5 text-[12.5px] leading-relaxed text-finn-black" }, contents(tip)),
        ],
    );
    box.style.width = `${WIDTH}px`;

    /* The hinge: a short bridge across the gap, level with the "i", that says this panel belongs to the chat. */
    hinge = el("div", {
        class: "fixed rounded-full bg-finn-accent-blue shadow-sm ring-2 ring-white",
        attrs: { "aria-hidden": "true" },
    });
    hinge.style.width = `${GAP + HINGE_REACH * 2}px`;
    hinge.style.height = `${HINGE_HEIGHT}px`;

    layer.append(box, hinge);

    if (!place(y)) {
        hideTip(false);
        return false;
    }

    /* The chat resized — dragged, or widened for the Adjust panel — and the "i" moved with it: close rather than point at nothing. */
    let first = true;
    watching = new ResizeObserver(() => {
        if (first) {
            first = false;
            return;
        }
        hideTip(true);
    });
    watching.observe(panel);

    return true;
}

/** The chat scrolled: follow its "i", or go once it's out of sight. */
export function moveTip(y: number): boolean {
    if (!box) return false;
    if (place(y)) return true;

    hideTip(false);
    return false;
}

/** Takes the companion away; `notify` when the reader closed it on this side, so the chat's "i" lets go too. */
export function hideTip(notify: boolean): void {
    if (!box) return;

    watching?.disconnect();
    watching = null;
    box.remove();
    hinge?.remove();
    box = null;
    hinge = null;

    if (notify) notifyClosed();
}

/* Escape on FINN's page closes it too, as it does in the chat. */
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && box) hideTip(true);
});
window.addEventListener("resize", () => hideTip(true));
