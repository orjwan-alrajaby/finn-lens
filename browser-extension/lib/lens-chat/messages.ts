import type { FinnSearch } from "@/lib/finn-search";
import type { Source } from "@/lib/sources";

/**
 * The messages between Lens's frames and the finn.com page they sit on.
 *
 * The chat and the drawer are extension pages in iframes; the page facts they
 * need — which cars are drawn here, which configuration the reader is looking
 * at — are only visible to the content script, and so is the page itself: the
 * drawer, the chips, the cards. They talk through the background script, which
 * knows which tab a frame belongs to (`sender.tab`), rather than through
 * `window.postMessage`, which finn.com's own scripts could also send.
 */

export type PageKind = "listing" | "details" | "home" | "other";

/** What the content script can honestly say about the page. */
export interface PageContext {
    kind: PageKind;
    url: string;
    /** Config ids of every car card drawn on the page, in page order. */
    pageCarIds: number[];
    /**
     * The configuration a details page is about: FINN's `selected_config` when
     * the URL names one, else the first configuration the page lists. Null
     * anywhere else.
     */
    currentCarId: number | null;
    /** Whether `currentCarId` came from the URL rather than page order. */
    currentFromUrl: boolean;
    /** Links FINN draws on each card, so a pin can store the car's own page. */
    carUrls: Record<number, string>;
    /**
     * What the reader filtered for on finn.com, read off the address: the
     * listing's filters, or the ones a car page carried over from it. Null on
     * an unfiltered page.
     */
    search: FinnSearch | null;
    /**
     * On a filtered listing, every configuration FINN lists for that search —
     * not only the cards drawn so far. `total` is FINN's count, which is more
     * than `ids` when the search is broad.
     */
    searchCars: { ids: number[]; total: number } | null;
}

/**
 * Sent by a Lens frame, relayed by the background script to the tab's top frame.
 *
 * Every request carries the token the tab's content script registered. The
 * frames are web-accessible on finn.com, so FINN's own scripts could frame a
 * copy of one; the token is what makes such a copy unable to act on the page.
 */
export type ChatToPage = { token: string } & (
    | { type: "LENS_CHAT_CONTEXT" }
    | { type: "LENS_CHAT_SHOW_CAR"; carId: number }
    | { type: "LENS_CHAT_CLOSE" }
    /* Wider for the Adjust panel beside the chat, then back to the reader's own size. */
    | { type: "LENS_CHAT_WIDE"; wide: boolean }
    /* `judgement`: an earlier judgement to read the car out of, by when it was made; the latest when absent. */
    | { type: "LENS_OPEN_DRAWER"; chatId: string; carId: number; judgement?: string }
    | { type: "LENS_CLOSE_DRAWER" }
    /* An "i" opened: its panel beside the chat, level with `y` (the "i"'s middle, in the chat frame's own coordinates). */
    | { type: "LENS_TIP_SHOW"; tip: TipContent; y: number }
    /* The chat scrolled: the "i" is at `y` now. */
    | { type: "LENS_TIP_MOVE"; y: number }
    | { type: "LENS_TIP_HIDE" }
);

/** What an "i" says, in the same order everywhere: what it is, why it's starred, what it means, what Lens checks, and where it's from. */
export interface TipContent {
    title: string;
    /** "Recommended because you said …": first, since it's why the star is there. */
    recommended?: string;
    /** A short paragraph each. */
    body?: (string | null | undefined)[];
    /** "I'll check": one item a line, rather than a run of "·". */
    /**
     * One item a line, each with its own "i" where it says what it does.
     * `tone`: what Lens counts ("check", the default), or what it also checks
     * on nearly every car ("standard"). `hint` closes the list.
     */
    lists?: { label: string; items: (string | TipItem)[]; hint?: string; tone?: "check" | "standard" }[];
    /** Said last and quieter: how it's scored, what tapping does. */
    note?: string;
    sources?: Source[];
}

/** One thing an "i" panel lists: its name, and what it does, opened under it by its own "i". */
export interface TipItem {
    label: string;
    does?: string;
}

/** A listed item as name and description, and the description as a sentence: "Cruise control that brakes …". */
export const tipItem = (item: string | TipItem): { label: string; does: string | null } =>
    typeof item === "string"
        ? { label: item, does: null }
        : { label: item.label, does: item.does ? `${item.does.charAt(0).toUpperCase()}${item.does.slice(1)}${/[.!?]$/.test(item.does) ? "" : "."}` : null };

/** Sent by the content script when the reader closed the "i"'s panel on the page side — ×, Escape, the chat closing. */
export interface TipClosed {
    type: "LENS_TIP_CLOSED";
    token: string;
}

export const CHAT_TO_PAGE_TYPES = new Set<string>([
    "LENS_CHAT_CONTEXT",
    "LENS_CHAT_SHOW_CAR",
    "LENS_CHAT_CLOSE",
    "LENS_CHAT_WIDE",
    "LENS_OPEN_DRAWER",
    "LENS_CLOSE_DRAWER",
    "LENS_TIP_SHOW",
    "LENS_TIP_MOVE",
    "LENS_TIP_HIDE",
]);

/** The extension pages allowed to use the bridge. */
export const FRAME_PAGES = ["/lens-chat.html", "/lens-drawer.html"] as const;

/** Content script → background: the token this tab's chat frame will present. */
export interface RegisterChat {
    type: "LENS_CHAT_REGISTER";
    token: string;
}

/** Frame → background: is this the token my tab registered? */
export interface VerifyChat {
    type: "LENS_CHAT_VERIFY";
    token: string;
}

/** Content script → a frame it created, by postMessage to the extension's origin. */
export interface ChatHandshake {
    source: "finn-lens-chat";
    token: string;
}

export const TOKENS_KEY = "lensChatTokens";

/** Sent by the content script when what the page shows has changed. */
export interface PageChanged {
    type: "LENS_CHAT_PAGE_CHANGED";
    /** The chat frame this page mounted, so other tabs' chats ignore it. */
    token: string;
}
