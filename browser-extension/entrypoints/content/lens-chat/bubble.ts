import type { ChatHandshake, ChatToPage, PageContext, PageKind, RegisterChat } from "@/lib/lens-chat/messages";

import { DETAILS_PAGE_SELECTOR, HOME_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR } from "../constants";
import { brandMark, el, panelStyles } from "../lens-panel/dom";
import { CARD_SELECTORS, cardConfigId, cardForCar, resolveCar } from "../lens-panel/currentCar";
import { highlightConfiguration } from "../lens-panel/highlight";
import { setCarPinned } from "../lens-panel/pin-control";
import { extractConfigId } from "../injectors/inject-pin-button/injectPinCarButtonIntoNode/utils";
import { ensureCarsFor, ensureSearchCars } from "../car-data";
import { currentSearch } from "../search";

/**
 * "Ask Lens" on finn.com: a small bubble, and the chat it opens.
 *
 * Everything here is page plumbing. The conversation itself is a React
 * extension page (`entrypoints/lens-chat`) in an iframe, so none of React, the
 * reasoning engine's UI or the AI client is loaded into finn.com until the
 * reader opens it — and when they do, it runs on the extension's origin, not
 * FINN's. What this file owns is the part only a content script can see: which
 * cars the page draws, which configuration it is about, and pinning a car the
 * same way the card and the panel do.
 *
 * The iframe is created on first open and hidden, not destroyed, on close, so
 * a conversation survives closing the bubble while the reader browses; a full
 * page load starts a new one, which is as much memory as this experiment wants.
 */

const HOST_ID = "finn-lens-chat";

let host: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let panel: HTMLElement | null = null;
let bubbleLabel: HTMLElement | null = null;
let isOpen = false;

/**
 * The secret this page's chat frame proves itself with.
 *
 * Registered with the background script for this tab, and handed only to the
 * frame this script creates — by a postMessage addressed to the extension's
 * origin, which finn.com's scripts can neither read nor redirect. It lives in
 * the content script's isolated world, never in the DOM.
 */
const token = crypto.randomUUID();

let registered: Promise<unknown> | null = null;

function register(): Promise<unknown> {
    registered ??= browser.runtime
        .sendMessage({ type: "LENS_CHAT_REGISTER", token } satisfies RegisterChat)
        .catch((error: unknown) => console.error("[FinnLens] couldn't register Ask Lens", error));

    return registered;
}

/* -------------------------------------------------------------------------- */
/* What the page shows                                                        */
/* -------------------------------------------------------------------------- */

function pageKind(): PageKind {
    if (document.querySelector(DETAILS_PAGE_SELECTOR)) return "details";
    if (document.querySelector(LISTINGS_PAGE_SELECTOR)) return "listing";
    if (document.querySelector(HOME_PAGE_SELECTOR)) return "home";
    return "other";
}

export function readPageContext(): PageContext {
    const ids: number[] = [];
    const carUrls: Record<number, string> = {};

    for (const card of document.querySelectorAll<HTMLElement>(CARD_SELECTORS)) {
        const id = cardConfigId(card);

        if (id == null || ids.includes(id)) continue;

        ids.push(id);

        const link = card.querySelector<HTMLAnchorElement>("a[href]")?.href;
        if (link) carUrls[id] = link;
    }

    const kind = pageKind();
    let currentCarId: number | null = null;
    let currentFromUrl = false;

    if (kind === "details") {
        const fromUrl = extractConfigId(
            new URL(window.location.href).searchParams.get("selected_config") ?? "",
        );

        const configurations = Array.from(
            document.querySelectorAll<HTMLElement>(`${DETAILS_PAGE_SELECTOR} [id^="product-"]`),
        )
            .map((node) => /^product-(\d+)$/.exec(node.id)?.[1])
            .filter(Boolean)
            .map(Number);

        currentFromUrl = fromUrl != null;
        currentCarId = fromUrl ?? configurations[0] ?? null;
    }

    return {
        kind,
        url: window.location.href,
        pageCarIds: ids,
        currentCarId,
        currentFromUrl,
        carUrls,
        /* Filled in by the chat's request, which can wait for FINN; this can't. */
        search: null,
        searchCars: null,
    };
}

/**
 * Where Ask Lens belongs: a listing, and a car's own page.
 *
 * Those are the two places a decision is being made — narrowing a search, and
 * weighing one car — and the two whose address says what the reader is
 * looking for. The home page draws cars too, but as a shop window: a chat
 * there is a chat about nothing in particular.
 */
function isDecisionPage(): boolean {
    const kind = pageKind();

    return kind === "listing" || kind === "details";
}

/* -------------------------------------------------------------------------- */
/* Messages from the chat                                                     */
/* -------------------------------------------------------------------------- */

let listening = false;

async function handle(message: ChatToPage): Promise<unknown> {
    switch (message.type) {
        case "LENS_CHAT_CONTEXT": {
            const context = readPageContext();

            /* What the reader filtered for, so the chat doesn't ask it again. */
            const search = await currentSearch();

            /*
             * On a filtered listing, everything that matches — the sample the
             * reader has narrowed FINN down to, rather than the cards drawn
             * so far — and with it most of the cards themselves.
             */
            const searchCars = search && context.kind === "listing" ? await ensureSearchCars(search) : null;

            /*
             * The cars this page is showing, before the chat says what it can
             * compare. Usually nothing to do — the content script fills them
             * in as the page draws them — but a chat opened on a page FINN
             * rendered on its server is exactly where that hasn't happened.
             */
            await ensureCarsFor([...context.pageCarIds, context.currentCarId].filter((id): id is number => id != null));

            return { ...context, search, searchCars };
        }

        case "LENS_CHAT_PIN":
            return pin(message.carId, message.pinned);

        case "LENS_CHAT_SHOW_CAR": {
            const card = cardForCar(message.carId);

            if (!card) return { shown: false };

            card.scrollIntoView({ behavior: "smooth", block: "center" });
            highlightConfiguration(message.carId);
            window.setTimeout(() => highlightConfiguration(null), 2400);

            return { shown: true };
        }

        case "LENS_CHAT_CLOSE":
            setOpen(false);
            return { closed: true };
    }
}

function listen(): void {
    if (listening) return;
    listening = true;

    /*
     * Answered through `sendResponse`, with `true` to keep the channel open,
     * rather than by returning a promise: that is the form every Chromium
     * version honours without a polyfill.
     */
    browser.runtime.onMessage.addListener((message: ChatToPage, sender, sendResponse) => {
        if (!message?.type?.startsWith("LENS_CHAT_") || message.type === ("LENS_CHAT_PAGE_CHANGED" as string)) {
            return undefined;
        }

        /* Only ever relayed by this extension's background, and only with this page's token. */
        if (sender.id !== browser.runtime.id || sender.tab || message.token !== token) {
            return undefined;
        }

        handle(message).then(sendResponse, (error: unknown) => {
            console.error("[FinnLens] Ask Lens request failed", error);
            sendResponse(null);
        });

        return true;
    });
}

/**
 * Pins exactly the car the reader asked for, from what Lens already holds.
 *
 * Never fetches: every car the chat can name came from Lens's own storage, so
 * a car this can't resolve is one the chat couldn't have offered.
 */
async function pin(carId: number, pinned: boolean): Promise<{ pinned: boolean } | { error: string }> {
    const car = await resolveCar(carId);

    if (!car) return { error: "Lens doesn't have this car's data any more." };

    try {
        return { pinned: await setCarPinned(car, pinned) };
    } catch (error) {
        console.error("[FinnLens] chat couldn't change what's pinned", error);
        return { error: "Couldn't update your pinned cars." };
    }
}

/* -------------------------------------------------------------------------- */
/* Making the chat bigger                                                     */
/* -------------------------------------------------------------------------- */

/** Where the size the reader dragged the chat to is kept, so it opens that size next time. */
const SIZE_KEY = "finnLensChatSize";

/** Never smaller than it opens at on a laptop; never past the window. */
const MIN_SIZE = { width: 360, height: 420 };
/** At least this much of finn.com stays visible around the panel. */
const EDGE = { x: 40, y: 100 };

/* From 640px up the chat is a panel beside the bubble; below it, a sheet that fills the width. */
const wide = () => window.matchMedia("(min-width: 640px)").matches;

function clampSize(width: number, height: number): { width: number; height: number } {
    return {
        width: Math.round(Math.min(Math.max(width, MIN_SIZE.width), window.innerWidth - EDGE.x)),
        height: Math.round(Math.min(Math.max(height, MIN_SIZE.height), window.innerHeight - EDGE.y)),
    };
}

/** A size set inline wins over the panel's default classes; clearing it goes back to them. */
function applySize(size: { width: number; height: number } | null): void {
    if (!panel) return;

    if (!size || !wide()) {
        panel.style.width = "";
        panel.style.height = "";
        return;
    }

    const next = clampSize(size.width, size.height);
    panel.style.width = `${next.width}px`;
    panel.style.height = `${next.height}px`;
}

let savedSize: { width: number; height: number } | null = null;

function saveSize(size: { width: number; height: number } | null): void {
    savedSize = size;
    void browser.storage.local.set({ [SIZE_KEY]: size }).catch(() => {});
}

/**
 * The corner the chat grows from.
 *
 * The panel is pinned to the bottom-right beside the bubble, so the top-left
 * corner is the one free to move: dragging it up and left makes the chat
 * bigger. While dragging, the chat's iframe stops taking pointer events —
 * otherwise the pointer crosses into it and the drag stalls mid-way. Arrow
 * keys resize it too, and a double-click puts it back to its usual size.
 */
function resizeHandle(): HTMLElement {
    let start: { x: number; y: number; width: number; height: number } | null = null;

    const handle = el("button", {
        class: [
            "absolute left-0 top-0 z-10 hidden h-4 w-4 cursor-nwse-resize items-center justify-center rounded-br-lg",
            "text-finn-iron/60 hover:bg-finn-snow hover:text-finn-accent-blue focus-visible:outline-2 focus-visible:outline-finn-accent-blue xs:flex",
        ].join(" "),
        attrs: {
            type: "button",
            "aria-label": "Resize the chat — drag, or use the arrow keys; double-click to reset",
            title: "Drag to resize · double-click to reset",
        },
        on: {
            pointerdown: (event: Event) => {
                const pointer = event as PointerEvent;
                if (!panel || pointer.button !== 0) return;

                pointer.preventDefault();
                const box = panel.getBoundingClientRect();
                start = { x: pointer.clientX, y: pointer.clientY, width: box.width, height: box.height };
                handle.setPointerCapture(pointer.pointerId);
                if (frame) frame.style.pointerEvents = "none";
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
                if (frame) frame.style.pointerEvents = "";

                const box = panel.getBoundingClientRect();
                saveSize({ width: box.width, height: box.height });
            },
            pointercancel: () => {
                start = null;
                if (frame) frame.style.pointerEvents = "";
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

    /* Two short diagonal strokes, the usual "grab here to resize" mark, pointing at the corner. */
    handle.innerHTML =
        '<svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 8 8 2M2 11.5 11.5 2"/></svg>';

    return handle;
}

/* -------------------------------------------------------------------------- */
/* The bubble and the frame                                                   */
/* -------------------------------------------------------------------------- */

function setOpen(next: boolean): void {
    if (!host || !panel) return;

    isOpen = next;

    if (next && !frame) {
        const src = browser.runtime.getURL("/lens-chat.html" as never) as string;

        frame = el("iframe", {
            class: "block h-full w-full border-0 bg-transparent",
            attrs: { title: "Ask Lens", allow: "" },
        });

        /*
         * The token goes in only once registration has landed, and again on
         * every load of the frame, addressed to the extension's origin so no
         * other document can receive it.
         */
        const handshake = () => {
            void register().then(() => {
                frame?.contentWindow?.postMessage(
                    { source: "finn-lens-chat", token } satisfies ChatHandshake,
                    new URL(src).origin,
                );
            });
        };

        frame.addEventListener("load", handshake);
        void register().then(() => frame?.setAttribute("src", src));

        panel.append(frame);
    }

    panel.style.display = next ? "block" : "none";
    panel.setAttribute("aria-hidden", String(!next));

    if (bubbleLabel) bubbleLabel.textContent = next ? "Close" : "Ask Lens";

    if (next) {
        frame?.focus();
        notifyPageChanged();
    }
}

/**
 * Tells an open chat the page moved on — a new car, more cards loaded — so it
 * can re-read the page before it next says what it is comparing.
 */
export function notifyPageChanged(): void {
    if (!frame) return;

    void browser.runtime
        .sendMessage({ type: "LENS_CHAT_PAGE_CHANGED", token })
        .catch(() => {});
}

/**
 * Ask Lens is part of Lens, not part of Lens AI.
 *
 * The bubble used to appear only where a Gemini key was saved and switched on,
 * which made the chat look like a feature of the model: without one, finn.com
 * had no Lens conversation at all. It has one — Lens asks its own questions,
 * ranks with its own engine and explains in its own words — and the model,
 * when it's on, lets the reader type instead of tap. So the bubble is here
 * whenever there are cars to talk about, and the panel says which chat it is.
 */

/** Adds the bubble where there are cars to talk about; hides it otherwise. */
export async function syncChatBubble(): Promise<void> {
    listen();

    if (!isDecisionPage()) {
        if (host && !isOpen) host.style.display = "none";
        return;
    }

    if (host) {
        /*
         * FINN's own rendering can take the page's top-level nodes with it on
         * a client-side navigation. A bubble that was built once and then
         * quietly detached would never come back, so put it back.
         */
        if (!host.isConnected && panel) document.documentElement.append(host);

        host.style.display = "";
        return;
    }

    /*
     * Claimed before anything is awaited: the mutation observer calls this on
     * every redraw, and a second call arriving while the stylesheet loads must
     * find the host already taken rather than mount a second bubble.
     */
    host = document.getElementById(HOST_ID) ?? document.createElement("div");
    host.id = HOST_ID;

    /*
     * Inline and with a very high stacking order, for the same reason the
     * panel's host is: finn.com's stylesheet reaches the light DOM, and a
     * fixed element here has to stay above FINN's sticky bars.
     */
    host.style.cssText =
        "position:fixed;right:20px;bottom:20px;z-index:2147483600;display:block;";

    const shadow = host.attachShadow({ mode: "open" });

    shadow.append(el("style", { text: await panelStyles() }));

    /*
     * Two shapes. On a phone the chat is a sheet inset evenly from both edges
     * of the screen, sized to the dynamic viewport so browser chrome sliding
     * in doesn't hide its input; from 640px up it is a panel beside the bubble.
     */
    panel = el("div", {
        class: [
            "overflow-hidden rounded-[24px] bg-white shadow-2xl ring-1 ring-black/5",
            "fixed inset-x-3 bottom-[76px] h-[min(680px,calc(100dvh-96px))]",
            "xs:absolute xs:inset-x-auto xs:right-0 xs:bottom-16 xs:w-[420px] xs:h-[min(680px,calc(100vh-110px))]",
        ].join(" "),
        attrs: { role: "dialog", "aria-label": "Ask Lens", "aria-hidden": "true" },
    });
    panel.style.display = "none";
    panel.append(resizeHandle());

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

    window.addEventListener("resize", () => applySize(savedSize));

    /* Visible from 640px; on a phone the bubble is the mark alone, covering less of FINN's cards. */
    bubbleLabel = el("span", { class: "max-xs:sr-only", text: "Ask Lens" });

    const bubble = el(
        "button",
        {
            class: [
                "flex h-12 items-center gap-2 rounded-full bg-finn-highlight-navy pl-1.5 pr-4 max-xs:pr-1.5",
                "text-[13px] font-black text-white shadow-xl ring-1 ring-white/10",
                "transition hover:bg-finn-accent-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-finn-accent-blue",
            ].join(" "),
            attrs: { type: "button", "aria-haspopup": "dialog" },
            on: {
                click: () => setOpen(!isOpen),
            },
        },
        [brandMark(36), bubbleLabel],
    );

    shadow.append(el("div", { class: "relative font-sans" }, [panel, bubble]));

    document.documentElement.append(host);
}
