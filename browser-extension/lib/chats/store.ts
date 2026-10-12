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

    return chats && typeof chats === "object" ? named(chats) : {};
}

/**
 * Each chat with a name of its own. Chats from before names were codes were
 * titled from their answers — "You have kids · You live in the city", the
 * same for half of them — and get one made from their id: the same each
 * time they're read, oldest first, so two can't end up with one.
 */
function named(chats: Record<string, Chat>): Record<string, Chat> {
    const taken = new Set(Object.values(chats).filter((chat) => isChatName(chat.title)).map((chat) => chat.title));
    const out = { ...chats };

    for (const chat of Object.values(chats).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (isChatName(chat.title)) continue;

        const title = nameFromId(chat.id, taken);
        taken.add(title);
        out[chat.id] = { ...chat, title };
    }

    return out;
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
        const stored = await loadChats();
        /* Never two chats with one name: a clash, however unlikely, takes the name made from its id — the same on every save. */
        const taken = new Set(Object.values(stored).filter((item) => item.id !== chat.id).map((item) => item.title));
        const own = isChatName(chat.title) && !taken.has(chat.title) ? chat : { ...chat, title: nameFromId(chat.id, taken) };
        const chats = { ...stored, [chat.id]: own };
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

/** The winner of a chat's judgement — an earlier one, by when it was made, or the latest. */
export async function winnerOf(chatId: string, at?: string): Promise<number | null> {
    const chat = await loadChat(chatId);
    const judgement = at ? ([chat?.judgement, ...(chat?.earlier ?? [])].find((item) => item?.at === at) ?? chat?.judgement) : chat?.judgement;

    return judgement?.winnerId ?? null;
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

/**
 * Whether the bubble should open by itself on this page. Answers once.
 *
 * Requests are stamped with the time they were made rather than set to
 * `true`, so a second request is a change storage reports even if the first
 * was never taken.
 */
export async function takeOpenRequest(): Promise<boolean> {
    const pending = await read<number | boolean | null>(OPEN_BUBBLE_KEY, null);

    if (!pending) return false;

    try {
        await browser.storage.local.remove(OPEN_BUBBLE_KEY);
    } catch {
        /* At worst the bubble opens by itself once more. */
    }

    return true;
}

/** Letters and digits that can't be misread for each other: no 0 and O, no 1, I and L. */
const NAME_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A chat's name: "Chat 7KQ-M4X". */
export const isChatName = (title: string | undefined): boolean => /^Chat [A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/.test(title ?? "");

/** Six characters as a name, three and three, so it can be read out and compared at a glance. */
const nameOf = (values: ArrayLike<number>): string => {
    const chars = Array.from({ length: 6 }, (_, index) => NAME_ALPHABET[values[index]! % NAME_ALPHABET.length]).join("");
    return `Chat ${chars.slice(0, 3)}-${chars.slice(3)}`;
};

/**
 * A new chat's name, random, and none of `taken`. 31⁶ — almost 900 million —
 * names, against at most 40 chats kept: a clash is all but impossible, and
 * is drawn again if it happens.
 */
export function newChatName(taken: Iterable<string> = []): string {
    const used = new Set(taken);

    for (;;) {
        const name = nameOf(crypto.getRandomValues(new Uint32Array(6)));
        if (!used.has(name)) return name;
    }
}

/** A name made from a chat's id, the same every time — for chats from before names, and the rare clash — and none of `taken`. */
export function nameFromId(id: string, taken: Iterable<string> = []): string {
    const used = new Set(taken);

    for (let salt = 0; ; salt += 1) {
        /* FNV-1a, one hash per character, each seeded differently. */
        const values = Array.from({ length: 6 }, (_, index) => {
            let hash = 0x811c9dc5 ^ (index + 1) ^ (salt << 8);
            for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
            return hash >>> 0;
        });
        const name = nameOf(values);
        if (!used.has(name)) return name;
    }
}

export const newChatId = (): string => `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const messageId = (): string => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
