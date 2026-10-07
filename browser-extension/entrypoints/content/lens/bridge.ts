import type { ChatToPage, PageContext, PageKind } from "@/lib/lens-chat/messages";

import { DETAILS_PAGE_SELECTOR, HOME_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR } from "../constants";
import { ensureCarsFor, ensureSearchCars } from "../car-data";
import { extractConfigId } from "../data/utils";
import { CARD_SELECTORS, cardConfigId, cardForCar } from "../page/currentCar";
import { highlightConfiguration } from "../page/highlight";
import { currentSearch } from "../search";

import { setChatOpen, setChatWide } from "./bubble";
import { hideTip, moveTip, showTip } from "./companion";
import { closeDrawer, openDrawer } from "./drawer";
import { token } from "./frames";

/**
 * What the page does for Lens's frames.
 *
 * The chat asks what the page shows and which cars it can judge; either frame
 * can open the drawer on a car, point at a car's card, or close itself. Every
 * request arrives through the background script with this page's token, so
 * only the frames this page created can ask.
 */

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

        const link = card.querySelector<HTMLAnchorElement>("a[href]")?.href ?? card.closest<HTMLAnchorElement>("a[href]")?.href;
        if (link) carUrls[id] = link;
    }

    const kind = pageKind();
    let currentCarId: number | null = null;
    let currentFromUrl = false;

    if (kind === "details") {
        const fromUrl = extractConfigId(new URL(window.location.href).searchParams.get("selected_config") ?? "");

        const configurations = Array.from(document.querySelectorAll<HTMLElement>(`${DETAILS_PAGE_SELECTOR} [id^="product-"]`))
            .map((node) => /^product-(\d+)$/.exec(node.id)?.[1])
            .filter(Boolean)
            .map(Number);

        currentFromUrl = fromUrl != null;
        currentCarId = fromUrl ?? configurations[0] ?? null;

        /* The configuration a car's page is about is a car on this page, card or not. */
        if (currentCarId != null && !ids.includes(currentCarId)) ids.unshift(currentCarId);
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

async function handle(message: ChatToPage): Promise<unknown> {
    switch (message.type) {
        case "LENS_CHAT_CONTEXT": {
            const context = readPageContext();

            /* What the reader filtered for, and everything that matches it. */
            const search = await currentSearch();
            const searchCars = search && context.kind === "listing" ? await ensureSearchCars(search) : null;

            /*
             * The cars this page is showing, before the chat says what it can
             * judge. Usually nothing to do — the content script fills them in
             * as the page draws them — but a page FINN rendered on its server
             * is exactly where that hasn't happened yet.
             */
            await ensureCarsFor(context.pageCarIds);

            return { ...context, search, searchCars } satisfies PageContext;
        }

        case "LENS_CHAT_SHOW_CAR": {
            const card = cardForCar(message.carId);

            if (!card) return { shown: false };

            card.scrollIntoView({ behavior: "smooth", block: "center" });
            highlightConfiguration(message.carId);
            window.setTimeout(() => highlightConfiguration(null), 2400);

            return { shown: true };
        }

        case "LENS_CHAT_CLOSE":
            setChatOpen(false);
            return { closed: true };

        case "LENS_CHAT_WIDE":
            return { wide: setChatWide(message.wide) };

        case "LENS_OPEN_DRAWER":
            await openDrawer(message.chatId, message.carId, message.judgement);
            return { opened: true };

        case "LENS_CLOSE_DRAWER":
            closeDrawer();
            return { closed: true };

        case "LENS_TIP_SHOW":
            return { shown: showTip(message.tip, message.y) };

        case "LENS_TIP_MOVE":
            return { shown: moveTip(message.y) };

        case "LENS_TIP_HIDE":
            hideTip(false);
            return { hidden: true };
    }
}

let listening = false;

export function listenToFrames(): void {
    if (listening) return;
    listening = true;

    /*
     * Answered through `sendResponse`, with `true` to keep the channel open,
     * rather than by returning a promise: that is the form every Chromium
     * version honours without a polyfill.
     */
    browser.runtime.onMessage.addListener((message: ChatToPage, sender, sendResponse) => {
        if (typeof message?.type !== "string" || !message.type.startsWith("LENS_") || message.type === ("LENS_CHAT_PAGE_CHANGED" as string)) {
            return undefined;
        }

        /* Only ever relayed by this extension's background, and only with this page's token. */
        if (sender.id !== browser.runtime.id || sender.tab || message.token !== token) return undefined;

        handle(message).then(sendResponse, (error: unknown) => {
            console.error("[FinnLens] a request from Lens failed", error);
            sendResponse(null);
        });

        return true;
    });
}
