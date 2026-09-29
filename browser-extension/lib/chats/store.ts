import type { Chat, SavedSettings } from "./types";

/**
 * Where chats live, and which one the page is showing.
 *
 * Four keys, and nothing else in the extension writes about the reader:
 *
 * - `finnLensChats` — every conversation, by id.
 * - `finnLensActiveChat` — the chat whose judgement the cards on finn.com
 *   show. It is the chat open in the bubble; opening another chat moves the
 *   chips to that one's judgement, and a chat with no judgement takes them off.
 * - `finnLensSettings` — the answers the reader asked Lens to keep. New chats
 *   start from them.
 * - `finnLensOpenBubble` — set on install, and by the popup, so the bubble
 *   opens by itself on the next finn.com page it meets. Cleared once it has.
 */

export const CHATS_KEY = "finnLensChats";
export const ACTIVE_CHAT_KEY = "finnLensActiveChat";
export const SETTINGS_KEY = "finnLensSettings";
export const OPEN_BUBBLE_KEY = "finnLensOpenBubble";

/** Chats beyond this many are the oldest ones, and are let go. */
const MAX_CHATS = 40;

async function read<T>(key: string, fallback: T): Promise<T> {
    try {
        return ((await browser.storage.local.get(key))[key] as T | undefined) ?? fallback;
    } catch {
        return fallback;
    }
}

export async function loadChats(): Promise<Record<string, Chat>> {
    const chats = await read<Record<string, Chat>>(CHATS_KEY, {});

    return chats && typeof chats === "object" ? chats : {};
}

/** Newest activity first. */
export async function listChats(): Promise<Chat[]> {
    return Object.values(await loadChats()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadChat(id: string): Promise<Chat | null> {
    return (await loadChats())[id] ?? null;
}

/**
 * Writes are serialised: the chat saves after every message, and two saves
 * reading the same record would each drop the other's change.
 */
let queue: Promise<unknown> = Promise.resolve();

function serially<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
}

export function saveChat(chat: Chat): Promise<void> {
    return serially(async () => {
        const chats = { ...(await loadChats()), [chat.id]: chat };
        const kept = Object.values(chats)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, MAX_CHATS);

        await browser.storage.local.set({ [CHATS_KEY]: Object.fromEntries(kept.map((item) => [item.id, item])) });
    });
}

export function deleteChat(id: string): Promise<void> {
    return serially(async () => {
        const chats = { ...(await loadChats()) };
        delete chats[id];

        await browser.storage.local.set({ [CHATS_KEY]: chats });

        if ((await activeChatId()) === id) await setActiveChat(null);
    });
}

export const activeChatId = (): Promise<string | null> => read<string | null>(ACTIVE_CHAT_KEY, null);

export async function setActiveChat(id: string | null): Promise<void> {
    try {
        await browser.storage.local.set({ [ACTIVE_CHAT_KEY]: id });
    } catch {
        /* The chips simply keep showing the previous chat until the next write. */
    }
}

export async function activeChat(): Promise<Chat | null> {
    const id = await activeChatId();

    return id ? loadChat(id) : null;
}

export const loadSettings = (): Promise<SavedSettings | null> => read<SavedSettings | null>(SETTINGS_KEY, null);

export async function saveSettings(settings: SavedSettings): Promise<void> {
    await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

/** Whether the bubble should open by itself on this page. Answers once. */
export async function takeOpenRequest(): Promise<boolean> {
    const pending = await read<boolean>(OPEN_BUBBLE_KEY, false);

    if (!pending) return false;

    try {
        await browser.storage.local.remove(OPEN_BUBBLE_KEY);
    } catch {
        /* At worst the bubble opens by itself once more. */
    }

    return true;
}

export const newChatId = (): string => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const messageId = (): string => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
