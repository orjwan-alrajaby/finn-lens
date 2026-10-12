import type { ChatHandshake, PageChanged, RegisterChat } from "@/lib/lens-chat/messages";

import { el } from "../page/dom";

/**
 * Lens's frames on finn.com: the chat and the drawer.
 *
 * Both are extension pages in iframes, so none of React, the engine or the
 * chat is loaded into finn.com until the reader asks for it, and when they do
 * it runs on the extension's origin, not FINN's. What this file owns is the
 * secret that lets those frames — and only those — act on the page.
 */

/**
 * The secret this page's frames prove themselves with.
 *
 * Registered with the background script for this tab, and handed only to the
 * frames this script creates — by a postMessage addressed to the extension's
 * origin, which finn.com's scripts can neither read nor redirect. It lives in
 * the content script's isolated world, never in the DOM.
 */
export const token = crypto.randomUUID();

let registered: Promise<unknown> | null = null;

export function register(): Promise<unknown> {
    registered ??= browser.runtime
        .sendMessage({ type: "LENS_CHAT_REGISTER", token } satisfies RegisterChat)
        .catch((error: unknown) => console.error("[FinnLens] couldn't register Lens's frames", error));

    return registered;
}

export type LensPage = "/lens-chat.html" | "/lens-drawer.html";

export const pageUrl = (page: LensPage, query = ""): string => `${browser.runtime.getURL(page as never)}${query}`;

/**
 * A frame for one of Lens's pages, handed the token on every load.
 *
 * The src is set only once registration has landed, so the frame can never
 * ask the background about a token it doesn't know yet.
 */
export function lensFrame(page: LensPage, title: string, query = ""): HTMLIFrameElement {
    const frame = el("iframe", {
        class: "block h-full w-full border-0 bg-transparent",
        attrs: { title, allow: "" },
    });

    frame.addEventListener("load", () => {
        void register().then(() => {
            frame.contentWindow?.postMessage(
                { source: "finn-lens-chat", token } satisfies ChatHandshake,
                new URL(pageUrl(page)).origin,
            );
        });
    });

    void register().then(() => frame.setAttribute("src", pageUrl(page, query)));

    return frame;
}

/** Tells this tab's frames the page moved on — a new page, more cars — so they can re-read it. */
export function notifyPageChanged(): void {
    void browser.runtime.sendMessage({ type: "LENS_CHAT_PAGE_CHANGED", token } satisfies PageChanged).catch(() => {});
}
