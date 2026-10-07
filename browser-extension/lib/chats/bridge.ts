import type { ChatHandshake, ChatToPage, PageChanged, PageContext, TipClosed, TipContent, VerifyChat } from "@/lib/lens-chat/messages";

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

/** The chat made wider for the Adjust panel beside it, or put back to the size the reader chose. */
export const requestChatWide = (wide: boolean) => send<{ wide: boolean }>({ type: "LENS_CHAT_WIDE", wide });

/** The drawer for one car: of the latest judgement, or of an earlier one named by when it was made. */
export const requestOpenDrawer = (chatId: string, carId: number, judgement?: string) =>
    send<{ opened: boolean }>({ type: "LENS_OPEN_DRAWER", chatId, carId, judgement });

export const requestCloseDrawer = () => send<{ closed: boolean }>({ type: "LENS_CLOSE_DRAWER" });

/**
 * An "i"'s panel beside the chat, on the page: shown where there's room to
 * the chat's left, else not — and then the chat shows it itself.
 */
export const requestTip = async (tip: TipContent, y: number) => (await send<{ shown: boolean }>({ type: "LENS_TIP_SHOW", tip, y }))?.shown === true;

/** The "i" moved with the chat's scroll; false once it's out of sight and the panel has gone. */
export const requestTipMove = async (y: number) => (await send<{ shown: boolean }>({ type: "LENS_TIP_MOVE", y }))?.shown === true;

export const requestTipHide = () => void send<{ hidden: boolean }>({ type: "LENS_TIP_HIDE" });

/** Calls `handler` when the reader closed the "i"'s panel on the page's side. */
export function onTipClosed(handler: () => void): () => void {
    const listener = (message: TipClosed) => {
        if (message?.type === "LENS_TIP_CLOSED" && confirmed && message.token === confirmed) handler();
    };

    browser.runtime.onMessage.addListener(listener);

    return () => browser.runtime.onMessage.removeListener(listener);
}

/** Calls `handler` whenever this frame's page says it changed. */
export function onPageChanged(handler: () => void): () => void {
    const listener = (message: PageChanged) => {
        if (message?.type === "LENS_CHAT_PAGE_CHANGED" && confirmed && message.token === confirmed) handler();
    };

    browser.runtime.onMessage.addListener(listener);

    return () => browser.runtime.onMessage.removeListener(listener);
}
