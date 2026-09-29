import type { ChatHandshake, ChatToPage, PageChanged, PageContext, VerifyChat } from "@/lib/lens-chat/messages";

/**
 * A Lens frame's side of the page bridge, for the chat and the drawer alike.
 *
 * Every request goes to the background script, which forwards it to the top
 * frame of the tab this frame is in. Each call resolves — to the page's answer
 * or to null — so a page that has navigated away, or a frame opened outside
 * finn.com while developing, degrades instead of throwing.
 */

/**
 * The token this frame proves itself with, once the page has handed it over.
 *
 * finn.com's own scripts share the parent's origin and could post a token too,
 * so every token offered is checked with the background script, which knows
 * the one this tab's content script registered, and only a confirmed one is
 * kept. A forged token can at most leave a forged frame unable to act.
 */
let confirmed: string | null = null;
let resolveToken: (token: string) => void = () => {};
const tokenReady = new Promise<string>((resolve) => {
    resolveToken = resolve;
});

window.addEventListener("message", (event: MessageEvent<ChatHandshake>) => {
    if (confirmed || event.source !== window.parent) return;
    if (event.origin !== "https://www.finn.com" || event.data?.source !== "finn-lens-chat") return;

    const offered = event.data.token;
    if (typeof offered !== "string") return;

    void browser.runtime
        .sendMessage({ type: "LENS_CHAT_VERIFY", token: offered } satisfies VerifyChat)
        .then((valid) => {
            if (valid && !confirmed) {
                confirmed = offered;
                resolveToken(offered);
            }
        })
        .catch(() => {});
});

/** Waits briefly for the handshake; a frame opened anywhere else gets no page. */
function withToken(): Promise<string | null> {
    return Promise.race([tokenReady, new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))]);
}

type Request = ChatToPage extends infer M ? (M extends ChatToPage ? Omit<M, "token"> : never) : never;

async function send<T>(message: Request): Promise<T | null> {
    const token = await withToken();

    if (!token) return null;

    try {
        return ((await browser.runtime.sendMessage({ ...message, token })) as T) ?? null;
    } catch (error) {
        if (import.meta.env.DEV) console.debug("[Lens] page request failed", message, error);
        return null;
    }
}

export const requestPageContext = () => send<PageContext>({ type: "LENS_CHAT_CONTEXT" });

export const requestShowCar = (carId: number) => send<{ shown: boolean }>({ type: "LENS_CHAT_SHOW_CAR", carId });

export const requestCloseChat = () => send<{ closed: boolean }>({ type: "LENS_CHAT_CLOSE" });

/** Calls `handler` whenever this frame's page says it changed. */
export function onPageChanged(handler: () => void): () => void {
    const listener = (message: PageChanged) => {
        if (message?.type === "LENS_CHAT_PAGE_CHANGED" && confirmed && message.token === confirmed) handler();
    };

    browser.runtime.onMessage.addListener(listener);

    return () => browser.runtime.onMessage.removeListener(listener);
}
