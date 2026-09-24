import type { PublicPath } from "wxt/browser";
import { needsOnboarding } from "@/lib/onboarding";
import { CHAT_TO_PAGE_TYPES, TOKENS_KEY } from "@/lib/lens-chat/messages";

export default defineBackground(() => {
  /*
   * The Lens chat on finn.com is an extension page inside an iframe. It can't
   * reach the content script in its own tab directly, so its requests come
   * here and go on to that tab's top frame.
   *
   * Two checks stand between a frame and the page. `sender.tab` is filled in
   * by the browser, so a frame can only ever act on the tab it is in. And the
   * request must carry the token that tab's content script registered — which
   * the content script hands only to the frame it created — so a copy of the
   * chat framed by finn.com's own scripts can't act on the page at all.
   * Tokens live in session storage, which outlives this worker's restarts.
   */
  const tokenFor = async (tabId: number): Promise<string | undefined> => {
    const stored = await browser.storage.session.get(TOKENS_KEY);
    return (stored[TOKENS_KEY] as Record<string, string> | undefined)?.[tabId];
  };

  browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    if (req?.type === "LENS_CHAT_REGISTER") {
      if (tabId == null || sender.frameId !== 0 || typeof req.token !== "string") return undefined;

      void browser.storage.session.get(TOKENS_KEY).then((stored) =>
        browser.storage.session.set({
          [TOKENS_KEY]: { ...(stored[TOKENS_KEY] as object | undefined), [tabId]: req.token },
        }),
      ).then(() => sendResponse(true), () => sendResponse(false));

      return true;
    }

    const fromChat =
      tabId != null && Boolean(sender.url?.startsWith(browser.runtime.getURL("/lens-chat.html")));

    if (req?.type === "LENS_CHAT_VERIFY") {
      if (!fromChat) return undefined;

      void tokenFor(tabId!).then((token) => sendResponse(Boolean(token) && token === req.token));

      return true;
    }

    if (!CHAT_TO_PAGE_TYPES.has(req?.type) || !fromChat) return undefined;

    void tokenFor(tabId!)
      .then((token) => {
        if (!token || token !== req.token) return null;
        return browser.tabs.sendMessage(tabId!, req, { frameId: 0 });
      })
      .then(sendResponse, () => sendResponse(null));

    /* Keeps the channel open for the page's answer. */
    return true;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void browser.storage.session.get(TOKENS_KEY).then((stored) => {
      const tokens = { ...(stored[TOKENS_KEY] as Record<string, string> | undefined) };
      if (!(tabId in tokens)) return;
      delete tokens[tabId];
      return browser.storage.session.set({ [TOKENS_KEY]: tokens });
    });
  });

  browser.runtime.onMessage.addListener((req) => {
    if (req.type === "OPEN_COMPARE_PAGE") { 
      void openOrFocusNewPage("/compare.html");
    } 
    else if (req.type === "OPEN_SETTINGS_PAGE") {
      /* A tab to open on — "searches", from the popup — travels in the hash, like a car for the pins page. */
      const tab = typeof req.tab === "string" && /^[a-z]+$/.test(req.tab) ? req.tab : null;

      void openOrFocusNewPage("/settings.html", tab ? `#tab=${tab}` : undefined);
    }
    else if (req.type === "OPEN_ONBOARDING_PAGE") {
      void openOrFocusNewPage("/onboarding.html");
    }
    else if (req.type === "OPEN_PINS_PAGE") {
      /*
       * A car to open is carried in the hash rather than the query: the pins
       * tab may already be open, and changing only the hash of an open tab
       * tells the page without reloading it.
       */
      const carId = Number(req.carId);

      void openOrFocusNewPage(
        "/pins.html",
        Number.isInteger(carId) && carId > 0 ? `#car=${carId}` : undefined,
      );
    }
  });

  /**
   * Meet a new reader with an explanation rather than an empty product.
   *
   * Only on a first install: an update must never interrupt someone
   * mid-task to re-explain a product they already use. `needsOnboarding`
   * is checked as well as the reason, because an extension can be removed
   * and reinstalled with its stored settings intact, and a reader who
   * already answered these questions should not be asked them again.
   */
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== "install") return;

    void (async () => {
      try {
        if (await needsOnboarding()) {
          await openOrFocusNewPage("/onboarding.html");
        }
      } catch (error) {
        console.error("Finn Lens: could not open the setup flow", error);
      }
    })();
  });
});

/**
 * Opens compare page if it doesn't exist.
 * Otherwise focuses existing compare tab.
 */
async function openOrFocusNewPage(
  url: PublicPath,
  /** Appended to the page's URL, and set on an existing tab too. */
  hash?: string,
) {
  /**
   * Extension page URL.
   *
   * Example:
   * chrome-extension://abc123/compare.html
   */
  const comparePageUrl =
    browser.runtime.getURL(url);

  /**
   * Search for existing compare page tab.
   */
  const existingTabs =
    await browser.tabs.query({
      url: comparePageUrl,
    });

  /**
   * Opens or focuses the specified extension page.
   * If a tab with the target URL already exists, focuses it instead of creating a duplicate.
   */
  if (existingTabs.length > 0) {
    const existingTab = existingTabs[0];

    if (!existingTab?.id) return;

    await browser.tabs.update(
      existingTab.id,
      {
        active: true,
        /*
         * Only the hash changes, so the page stays loaded and hears about
         * it through `hashchange`. The query above still finds the tab
         * whatever hash it has, since URL patterns ignore fragments.
         */
        ...(hash ? { url: `${comparePageUrl}${hash}` } : {}),
      }
    );

    if (existingTab.windowId && existingTab.windowId !== -1) {
      await browser.windows.update(
        existingTab.windowId,
        {
          focused: true,
        }
      );
    }
    return;
  }

  /**
   * Otherwise create fresh compare page.
   */
  await browser.tabs.create({
    url: `${comparePageUrl}${hash ?? ""}`,
  });
}