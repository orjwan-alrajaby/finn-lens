import { CHAT_SIZE_KEY } from "@/lib/chats/data";

import { brandMark, el, panelStyles } from "../page/dom";

import { hideTip } from "./companion";
import { lensFrame, notifyPageChanged } from "./frames";

/**
 * The Lens bubble on finn.com, and the chat it opens.
 *
 * The conversation itself is a React extension page (`entrypoints/lens-chat`)
 * in an iframe. The frame is created on first open and hidden, not destroyed,
 * on close, so a conversation survives closing the bubble while the reader
 * browses. The chat is kept in storage besides, so a full page load picks up
 * exactly where it was.
 *
 * On every finn.com page: the chat can greet a reader anywhere, and says so
 * plainly when there are no cars here to judge.
 */

const HOST_ID = "finn-lens-chat";

let host: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let panel: HTMLElement | null = null;
/** Inside the panel: what rounds the chat's corners, so the resize grip on the panel can sit over its edge. */
let clip: HTMLElement | null = null;
let bubbleLabel: HTMLElement | null = null;
/** What the chat and the bubble sit in: the companion beside the chat is drawn here too. */
let layer: HTMLElement | null = null;
let isOpen = false;

/** The chat's panel, for what sits beside it. */
export const chatPanel = (): HTMLElement | null => panel;
export const chatLayer = (): HTMLElement | null => layer;

/* -------------------------------------------------------------------------- */
/* Making the chat bigger                                                     */
/* -------------------------------------------------------------------------- */

/** Where the size the reader dragged the chat to is kept, so it opens that size next time. */
const SIZE_KEY = CHAT_SIZE_KEY;

/** Never smaller than it opens at on a laptop; never past the window. */
const MIN_SIZE = { width: 360, height: 420 };
/** At least this much of finn.com stays visible around the panel. */
const EDGE = { x: 40, y: 100 };

/* From 640px up the chat is a panel beside the bubble; below it, a sheet that fills the width. */
export const isWide = () => window.matchMedia("(min-width: 640px)").matches;

function clampSize(width: number, height: number): { width: number; height: number } {
    return {
        width: Math.round(Math.min(Math.max(width, MIN_SIZE.width), window.innerWidth - EDGE.x)),
        height: Math.round(Math.min(Math.max(height, MIN_SIZE.height), window.innerHeight - EDGE.y)),
    };
}

/** A size set inline wins over the panel's default classes; clearing it goes back to them. */
function applySize(size: { width: number; height: number } | null): void {
    if (!panel) return;

    if (!size || !isWide()) {
        panel.style.width = "";
        panel.style.height = "";
        return;
    }

    const next = clampSize(size.width, size.height);
    panel.style.width = `${next.width}px`;
    panel.style.height = `${next.height}px`;
}

let savedSize: { width: number; height: number } | null = null;

/** Expanded: for the Adjust panel beside the chat, or because the reader asked. */
let widened = false;

/** Expanded, the chat is as wide as fits up to this, and as tall as the window allows. */
const WIDE = { width: 900 };

/**
 * Expanded while the reader adjusts what Lens understood, so the panel sits
 * beside the chat rather than over it, or while they've asked for it — the
 * header's expand, or Lens showing what it understood; back to their own
 * size after. Never saved as their size. A phone's sheet is full width
 * already, so it's left be. Returns whether it's wide now.
 */
export function setChatWide(wide: boolean): boolean {
    widened = wide;
    if (!panel || !isWide()) return false;

    if (!wide) {
        applySize(savedSize);
        return false;
    }

    const box = panel.getBoundingClientRect();
    /* Clamped to the window: as tall as it allows. */
    applySize({ width: Math.max(box.width, WIDE.width), height: window.innerHeight });
    return true;
}

function saveSize(size: { width: number; height: number } | null): void {
    savedSize = size;
    void browser.storage.local.set({ [SIZE_KEY]: size }).catch(() => {});
}

/**
 * The corner the chat grows from.
 *
 * The panel is pinned to the bottom-right beside the bubble, so the top-left
 * corner is the one free to move: dragging it up and left makes the chat
 * bigger. It's a round white grip with arrows, sitting on the corner rather
 * than inside it — on the navy header a small mark went unseen — and says
 * "Drag to resize" when pointed at. While dragging, the chat's iframe stops
 * taking pointer events — otherwise the pointer crosses into it and the drag
 * stalls mid-way — and the size follows the pointer without easing. Arrow
 * keys resize it too, and a double-click puts it back to its usual size.
 */
function resizeHandle(): HTMLElement {
    let start: { x: number; y: number; width: number; height: number } | null = null;
    /* Easing is for the expand button and the keys; a drag follows the pointer as it goes. */
    const dragging = (on: boolean) => {
        if (frame) frame.style.pointerEvents = on ? "none" : "";
        if (panel) panel.style.transition = on ? "none" : "";
    };

    const handle = el("button", {
        class: [
            "group absolute -left-3 -top-3 z-10 hidden h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full",
            "bg-white text-finn-highlight-navy shadow-md ring-1 ring-black/10 transition-colors",
            "hover:bg-finn-pale-blue hover:text-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue xs:flex",
        ].join(" "),
        attrs: {
            type: "button",
            "aria-label": "Resize the chat — drag, or use the arrow keys; double-click to reset",
        },
        on: {
            pointerdown: (event: Event) => {
                const pointer = event as PointerEvent;
                if (!panel || pointer.button !== 0) return;

                pointer.preventDefault();
                const box = panel.getBoundingClientRect();
                start = { x: pointer.clientX, y: pointer.clientY, width: box.width, height: box.height };
                handle.setPointerCapture(pointer.pointerId);
                dragging(true);
            },
            pointermove: (event: Event) => {
                const pointer = event as PointerEvent;
                if (!start) return;

                applySize({ width: start.width + (start.x - pointer.clientX), height: start.height + (start.y - pointer.clientY) });
            },
            pointerup: (event: Event) => {
                if (!start || !panel) return;

                start = null;
                handle.releasePointerCapture((event as PointerEvent).pointerId);
                dragging(false);

                const box = panel.getBoundingClientRect();
                saveSize({ width: box.width, height: box.height });
            },
            pointercancel: () => {
                start = null;
                dragging(false);
            },
            dblclick: () => {
                applySize(null);
                saveSize(null);
            },
            keydown: (event: Event) => {
                const key = (event as KeyboardEvent).key;
                const step = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[key];
                if (!step || !panel) return;

                event.preventDefault();
                const box = panel.getBoundingClientRect();
                applySize({ width: box.width + step[0]!, height: box.height + step[1]! });
                const after = panel.getBoundingClientRect();
                saveSize({ width: after.width, height: after.height });
            },
        },
    });

    /* Arrows out to the corner and back: it pulls both ways. Then what it does, on hover and focus. */
    handle.innerHTML =
        '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 13v6h-6M5 11V5h6M5 5l14 14"/></svg>';
    handle.append(
        el("span", {
            class: [
                "pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md bg-finn-highlight-navy px-2 py-1",
                "text-[12px] font-bold text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            ].join(" "),
            attrs: { "aria-hidden": "true" },
            text: "Drag to resize",
        }),
    );

    return handle;
}

/* -------------------------------------------------------------------------- */
/* The bubble and the frame                                                   */
/* -------------------------------------------------------------------------- */

export const isChatOpen = (): boolean => isOpen;

export function setChatOpen(next: boolean): void {
    if (!host || !panel) return;

    isOpen = next;

    if (next && !frame) {
        frame = lensFrame("/lens-chat.html", "Lens");
        clip?.append(frame);
    }

    panel.style.display = next ? "block" : "none";
    panel.setAttribute("aria-hidden", String(!next));

    /* The "i"'s companion belongs to the chat: it goes when the chat does. */
    if (!next) hideTip(true);

    if (bubbleLabel) bubbleLabel.textContent = next ? "Close" : "Lens";

    if (next) {
        frame?.focus();
        notifyPageChanged();
    }
}

let mounting: Promise<void> | null = null;

/**
 * Adds the bubble to the page, once, and puts it back if FINN's rendering took
 * it away.
 *
 * Every caller waits for the same mount. The mutation observer calls this on
 * every redraw, and a request to open the bubble arriving while the stylesheet
 * loads has to find a panel it can open — not return early because a mount has
 * started, and open nothing.
 */
export async function syncChatBubble(): Promise<void> {
    mounting ??= mount();

    await mounting;

    /*
     * FINN's own rendering can take the page's top-level nodes with it on a
     * client-side navigation. A bubble that was built once and then quietly
     * detached would never come back, so put it back.
     */
    if (host && !host.isConnected) document.documentElement.append(host);
}

async function mount(): Promise<void> {
    host = document.getElementById(HOST_ID) ?? document.createElement("div");
    host.id = HOST_ID;

    /*
     * Inline and with a very high stacking order: finn.com's stylesheet
     * reaches the light DOM, and a fixed element here has to stay above
     * FINN's sticky bars.
     */
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483600;display:block;";

    const shadow = host.attachShadow({ mode: "open" });

    shadow.append(el("style", { text: await panelStyles() }));

    /*
     * Two shapes. On a phone the chat is a sheet inset evenly from both edges
     * of the screen, sized to the dynamic viewport so browser chrome sliding
     * in doesn't hide its input; from 640px up it is a panel beside the bubble.
     */
    panel = el("div", {
        class: [
            "rounded-[24px] shadow-2xl",
            "fixed inset-x-3 bottom-[76px] h-[min(680px,calc(100dvh-96px))]",
            "xs:absolute xs:inset-x-auto xs:right-0 xs:bottom-16 xs:w-[420px] xs:h-[min(680px,calc(100vh-110px))]",
            /* Expanding and shrinking ease into place, rather than jumping. */
            "xs:transition-[width,height] xs:duration-300 xs:ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        ].join(" "),
        attrs: { role: "dialog", "aria-label": "Lens", "aria-hidden": "true" },
    });
    panel.style.display = "none";
    clip = el("div", { class: "absolute inset-0 overflow-hidden rounded-[24px] bg-white ring-1 ring-black/5" });
    panel.append(clip, resizeHandle());

    /* The size the reader last dragged it to, kept within whatever window this is. */
    void browser.storage.local
        .get(SIZE_KEY)
        .then((stored) => {
            const size = stored[SIZE_KEY] as { width: number; height: number } | null | undefined;
            if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
                savedSize = size;
                applySize(size);
            }
        })
        .catch(() => {});

    /* Kept within the window as it changes — and wide, while the Adjust panel is open. */
    window.addEventListener("resize", () => (widened ? setChatWide(true) : applySize(savedSize)));

    /* Visible from 640px; on a phone the bubble is the mark alone, covering less of FINN's cards. */
    bubbleLabel = el("span", { class: "max-xs:sr-only", text: "Lens" });

    const bubble = el(
        "button",
        {
            class: [
                "flex h-12 items-center gap-2 rounded-full bg-finn-highlight-navy pl-1.5 pr-4 max-xs:pr-1.5",
                "text-[13px] font-black text-white shadow-xl ring-1 ring-white/10",
                "transition hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
            ].join(" "),
            attrs: { type: "button", "aria-haspopup": "dialog", "aria-label": "Chat with Lens" },
            on: {
                click: () => setChatOpen(!isOpen),
            },
        },
        [brandMark(36), bubbleLabel],
    );

    layer = el("div", { class: "relative font-sans" }, [panel, bubble]);
    shadow.append(layer);

    document.documentElement.append(host);
}

/** Hides the bubble and the chat while the drawer has the right of the screen, and brings them back. */
export function setBubbleVisible(visible: boolean): void {
    if (host) host.style.display = visible ? "block" : "none";
}
