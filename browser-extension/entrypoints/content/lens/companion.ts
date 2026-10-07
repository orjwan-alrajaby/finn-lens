import type { TipClosed, TipContent } from "@/lib/lens-chat/messages";
import { TIP_CARD, TIP_DOT, TIP_HEADING, type TipTone } from "@/lib/lens-chat/tip-style";

import { el } from "../page/dom";

import { chatLayer, chatPanel } from "./bubble";
import { token } from "./frames";

/**
 * The "i"'s companion panel: what an answer means, in a small panel of its
 * own beside the chat, on its left — separate from the chat, so it never
 * covers the chips it explains.
 *
 * It's held up like a sign on a post: a stick comes out from behind the
 * chat, from its bottom middle, runs left beneath the chat's edge, and turns
 * up to carry the panel from below. The panel sits as near the "i" that
 * opened it as the post allows, and that "i" shows it's pressed.
 *
 * The chat can't draw outside its own frame, so it hands the content here
 * and this draws it. Where there's no room on the chat's left — a phone's
 * full-width sheet, a narrow window — `showTip` says no, and the chat shows
 * the panel inside itself instead.
 */

const WIDTH = 280;
/** The space between the companion and the chat. */
const GAP = 22;
/** At least this much of finn.com shows beside the companion. */
const EDGE = 8;
/** The post: how thick, how far above the chat's bottom edge it runs, and the least of it showing under the panel. */
const POST = 6;
const POST_LEVEL = 40;
const POST_SHOWING = 44;

let box: HTMLElement | null = null;
let post: HTMLElement | null = null;
let watching: ResizeObserver | null = null;

/* Lucide's paths, inline: the content script carries no icon library. */
const ICONS = {
    info: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    dotStar: '<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    dotInfo: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>',
};

function icon(markup: string, className: string): HTMLElement {
    const span = el("span", { class: className, attrs: { "aria-hidden": "true" } });
    span.innerHTML = markup;
    return span;
}

/** The small coloured disc on each line, as the drawer has them. */
function dot(tone: TipTone): HTMLElement {
    const markup = tone === "star" ? ICONS.dotStar : tone === "note" ? ICONS.dotInfo : ICONS.check;
    return icon(markup, `mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${TIP_DOT[tone]}`);
}

/** The same layout as the panel inside the chat (`TipPanel`): soft cards, a coloured disc on each line. */
function contents(tip: TipContent): HTMLElement[] {
    const body = (tip.body ?? []).filter((paragraph): paragraph is string => Boolean(paragraph));
    const lists = (tip.lists ?? []).filter((list) => list.items.length);
    const sources = tip.sources ?? [];

    return [
        ...(tip.recommended
            ? [el("div", { class: `${TIP_CARD} flex gap-2` }, [dot("star"), el("p", { class: "text-[12.5px] font-semibold leading-snug text-[#7a4f00]", text: tip.recommended })])]
            : []),
        ...body.map((paragraph) => el("p", { class: "px-0.5", text: paragraph })),
        ...lists.map((list) => {
            const tone = list.tone ?? "check";
            return el("div", { class: TIP_CARD }, [
                el("p", { class: `text-[12.5px] font-black ${TIP_HEADING[tone]}`, text: list.label }),
                list.hint ? el("p", { class: "text-[11.5px] leading-snug text-finn-iron", text: list.hint }) : null,
                el(
                    "ul",
                    { class: "mt-1.5 space-y-1.5" },
                    list.items.map((item) => el("li", { class: "flex items-start gap-2" }, [dot(tone), el("span", { class: "leading-snug", text: item })])),
                ),
            ]);
        }),
        ...(tip.note ? [el("div", { class: "flex items-start gap-2 px-0.5" }, [dot("note"), el("p", { class: "text-[12px] leading-snug text-finn-iron", text: tip.note })])] : []),
        ...(sources.length
            ? [
                  el(
                      "p",
                      { class: "flex flex-wrap gap-x-3 text-[12px]" },
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

/**
 * Puts the companion as near the "i" at `y` in the chat frame as its post
 * allows, and the post under it. False when the "i" is out of the chat's
 * sight.
 */
function place(y: number): boolean {
    const panel = chatPanel();
    if (!panel || !box || !post) return false;

    const chat = panel.getBoundingClientRect();
    if (y < 0 || y > chat.height) return false;

    /* Where the post runs, behind the chat near its bottom; the panel stays above it, with some of the post showing. */
    const level = chat.bottom - POST_LEVEL;
    const lowest = level - POST_SHOWING;

    box.style.maxHeight = `${Math.round(lowest - chat.top)}px`;
    const height = box.getBoundingClientRect().height;
    const top = Math.min(Math.max(chat.top, chat.top + y - 36), lowest - height);
    const left = chat.left - GAP - WIDTH;

    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;

    /* One element drawn as an L: up from under the panel's middle, round the corner, and right to the chat's middle, behind it. */
    const postLeft = left + WIDTH / 2 - POST / 2;
    const postTop = top + height - 8;
    post.style.left = `${Math.round(postLeft)}px`;
    post.style.top = `${Math.round(postTop)}px`;
    post.style.width = `${Math.round(chat.left + chat.width / 2 - postLeft)}px`;
    post.style.height = `${Math.round(level + POST / 2 - postTop)}px`;

    return true;
}

/** Shows `tip` beside the chat. False where there's no room, and the chat shows it itself. */
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
            el("div", { class: "flex shrink-0 items-center gap-2.5 border-b border-finn-cotton px-4 py-3" }, [
                icon(ICONS.info, "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-finn-accent-blue text-white"),
                el("p", { class: "min-w-0 flex-1 text-[14.5px] font-black leading-snug text-finn-black", text: tip.title }),
                close,
            ]),
            el("div", { class: "min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 pt-3 pb-3.5 text-[13px] leading-[1.55] text-finn-black" }, contents(tip)),
        ],
    );
    box.style.width = `${WIDTH}px`;

    post = el("div", { class: "fixed rounded-bl-[18px] border-b-[6px] border-l-[6px] border-finn-accent-blue", attrs: { "aria-hidden": "true" } });

    /* The post first, so the chat — and the panel — are drawn over its ends. */
    layer.prepend(post);
    layer.append(box);

    if (!place(y)) {
        hideTip(false);
        return false;
    }

    /* The chat resized — dragged, or widened for the Adjust panel: close rather than hang in the wrong place. */
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

/** The chat scrolled: keep near its "i", or go once it's out of sight. */
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
    post?.remove();
    box = null;
    post = null;

    if (notify) notifyClosed();
}

/* Escape on FINN's page closes it too, as it does in the chat. */
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && box) hideTip(true);
});
window.addEventListener("resize", () => hideTip(true));
