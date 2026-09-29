import { CHAT_TO_PAGE_TYPES, FRAME_PAGES, TOKENS_KEY } from "@/lib/lens-chat/messages";
import { OPEN_BUBBLE_KEY } from "@/lib/chats/store";
import { FINN_BASE_URL } from "@/lib/constants";

export default defineBackground(() => {
  /*
   * Lens's chat on finn.com is an extension page inside an iframe.
   * They can't reach the content script in their own tab directly, so their
   * requests come here and go on to that tab's top frame.
   *
   * Two checks stand between a frame and the page. `sender.tab` is filled in
   * by the browser, so a frame can only ever act on the tab it is in. And the
   * request must carry the token that tab's content script registered — which
   * the content script hands only to the frames it created — so a copy framed
   * by finn.com's own scripts can't act on the page at all. Tokens live in
   * session storage, which outlives this worker's restarts.
   */
  const tokenFor = async (tabId: number): Promise<string | undefined> => {
    const stored = await browser.storage.session.get(TOKENS_KEY);
    return (stored[TOKENS_KEY] as Record<string, string> | undefined)?.[tabId];
  };

  const isLensFrame = (url: string | undefined) =>
    FRAME_PAGES.some((page) => Boolean(url?.startsWith(browser.runtime.getURL(page as never))));

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

    const fromFrame = tabId != null && isLensFrame(sender.url);

    if (req?.type === "LENS_CHAT_VERIFY") {
      if (!fromFrame) return undefined;

      void tokenFor(tabId!).then((token) => sendResponse(Boolean(token) && token === req.token));

      return true;
    }

    if (!CHAT_TO_PAGE_TYPES.has(req?.type) || !fromFrame) return undefined;

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

  /**
   * Meet a new reader where the cars are.
   *
   * Only on a first install: an update must never interrupt someone mid-task.
   * The open-bubble flag makes the bubble open by itself on the first
   * finn.com page it meets, and a finn.com tab is opened for it — content scripts don't
   * reach tabs that were already open before the extension was installed, so
   * without a fresh one there would be nothing to greet the reader on until
   * they reloaded.
   */
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason !== "install") return;

    void (async () => {
      try {
        await browser.storage.local.set({ [OPEN_BUBBLE_KEY]: true });
        await browser.tabs.create({ url: `${FINN_BASE_URL}/de-DE/subscribe` });
      } catch (error) {
        console.error("Finn Lens: could not open finn.com after install", error);
      }
    })();
  });
});
