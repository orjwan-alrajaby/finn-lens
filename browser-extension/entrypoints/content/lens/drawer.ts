import { el, panelStyles } from "../page/dom";
import { highlightConfiguration } from "../page/highlight";

import { isChatOpen, setBubbleVisible, setChatOpen } from "./bubble";
import { lensFrame } from "./frames";

/**
 * The drawer: how one car fits the reader, behind the chip on its card.
 *
 * A sheet down the right of the window with a React page inside it
 * (`entrypoints/lens-drawer`), which re-runs the chat's judgement and reads
 * one car out of it — or, for the car with the trophy, the whole argument for
 * it, with the PDF export.
 *
 * The chat steps aside while it is open. The two would otherwise fight over
 * the same corner, and the drawer is what the reader just asked for; closing
 * it brings the chat back as it was.
 */

const HOST_ID = "finn-lens-drawer";

let host: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let frame: HTMLIFrameElement | null = null;
let chatWasOpen = false;
let open = false;

export const isDrawerOpen = (): boolean => open;

async function mount(): Promise<HTMLElement> {
    if (host && sheet) {
        if (!host.isConnected) document.documentElement.append(host);
        return sheet;
    }

    host = document.getElementById(HOST_ID) ?? document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0 0 0 auto;z-index:2147483601;display:none;";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.append(el("style", { text: await panelStyles() }));

    sheet = el("div", {
        class: [
            "fixed inset-y-0 right-0 w-screen xs:w-[460px] bg-white shadow-2xl ring-1 ring-black/5",
            "xs:rounded-l-[24px] overflow-hidden",
        ].join(" "),
        attrs: { role: "dialog", "aria-label": "How this car fits you" },
    });

    shadow.append(sheet);
    document.documentElement.append(host);

    return sheet;
}

export async function openDrawer(chatId: string, carId: number, judgement?: string): Promise<void> {
    const target = await mount();

    if (!open) {
        chatWasOpen = isChatOpen();
        setChatOpen(false);
        setBubbleVisible(false);
    }

    open = true;
    host!.style.display = "block";

    /* A fresh frame per car: the page reads its car from the address, once. */
    frame?.remove();
    const which = judgement ? `&judgement=${encodeURIComponent(judgement)}` : "";
    frame = lensFrame("/lens-drawer.html", "How this car fits you", `?chat=${encodeURIComponent(chatId)}&car=${carId}${which}`);
    target.append(frame);
    frame.focus();

    highlightConfiguration(carId);
}

export function closeDrawer(): void {
    if (!open || !host) return;

    open = false;
    host.style.display = "none";
    frame?.remove();
    frame = null;

    highlightConfiguration(null);
    setBubbleVisible(true);

    if (chatWasOpen) setChatOpen(true);
}

/* Escape pressed on FINN's page, rather than inside the drawer, closes it too. */
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) closeDrawer();
});
