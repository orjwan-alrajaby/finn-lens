import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrashScreen } from "./ErrorBoundary";

/* Lens's mark asks the extension for its icon; outside the browser there is none. */
(globalThis as unknown as { browser: unknown }).browser = { runtime: { getURL: (path: string) => path } };

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("when a page breaks", () => {
    it("says so, says nothing is lost, and offers a reload — and the page's own way back where it has one", () => {
        const plain = text(renderToStaticMarkup(createElement(CrashScreen, { onReload: () => {} })));
        const chat = text(renderToStaticMarkup(createElement(CrashScreen, { onReload: () => {}, recover: { label: "Start a new chat", run: () => {} } })));

        expect(plain).toBe("Something went wrong in Lens Your chats and saved answers are kept. Reloading usually puts it right. Reload");
        expect(chat).toMatch(/Reload Start a new chat$/);
    });
});
