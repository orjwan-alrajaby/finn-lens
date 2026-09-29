import "@/assets/tailwind.css";
import { ACTIVE_CHAT_KEY, CHATS_KEY, OPEN_BUBBLE_KEY, takeOpenRequest } from "@/lib/chats/store";

import { HOME_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR, DETAILS_PAGE_SELECTOR } from "./constants";
import { mapFinnConfigToAll } from "./manipulateApiData";
import { mergeLoadedCars } from "./data/cache";
import { ensurePageCars, forgetAsked } from "./car-data";
import { setChatOpen, syncChatBubble } from "./lens/bubble";
import { listenToFrames } from "./lens/bridge";
import { paintChips, refreshChips } from "./lens/chips";
import { closeDrawer } from "./lens/drawer";
import { notifyPageChanged } from "./lens/frames";

export default defineContentScript({
  matches: ["https://www.finn.com/*"],

  /*
   * The stylesheet is built but never put on finn.com itself: it is a full
   * Tailwind build with a reset, and it is only ever wanted inside Lens's own
   * shadow roots (the bubble and the drawer fetch it from there). The chips
   * carry their own few lines of CSS.
   */
  cssInjectionMode: "manual",

  async main() {
    try {
      await injectScript("/network-interceptor.js");
      console.info("[FinnLens] interceptor injected");
    } catch (e) {
      console.error("[FinnLens] injection failed", e);
    }

    listenToFrames();

    /*
     * Every car FINN's own page loads, kept.
     *
     * The interceptor forwards each /api/cars response, so the chat usually
     * needs no request of its own: the cars the reader is looking at were
     * fetched by the page that is showing them. Merged into whatever is
     * already stored, never written from a copy of its own.
     */
    window.addEventListener("message", async (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== "finn-lens") return;
      if (event.data?.type !== "FINN_CARS_RESPONSE") return;

      const batchLoaded = event.data.payload?.results;

      /* FINN's response shape is not ours to rely on. */
      if (!Array.isArray(batchLoaded) || !batchLoaded.length) return;

      try {
        await mergeLoadedCars(mapFinnConfigToAll(batchLoaded));
      } catch (error) {
        console.error("[FinnLens] couldn't keep this page's cars", error);
      }
    });

    let activeObserver: MutationObserver | null = null;
    let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let navDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    /*
     * FINN's own navigations, heard from FINN's own world: the injected page
     * script wraps `history`, since a content script's copy of it is one
     * finn.com never calls.
     */
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== "finn-lens") return;
      if (event.data?.type !== "FINN_NAVIGATED") return;

      window.dispatchEvent(new Event("finnlens:navigate"));
    });

    window.addEventListener("popstate", () =>
      window.dispatchEvent(new Event("finnlens:navigate"))
    );

    const runInjections = () => {
      /* The chat's verdicts on whatever cards FINN has drawn now. */
      paintChips();

      void syncChatBubble().catch((error: unknown) => {
        console.error("[FinnLens] couldn't add the Lens bubble", error);
      });
    };

    const startObserving = () => {
      activeObserver?.disconnect();

      activeObserver = new MutationObserver(() => {
        if (mutationDebounceTimer !== null) {
          clearTimeout(mutationDebounceTimer);
        }

        mutationDebounceTimer = setTimeout(() => {
          mutationDebounceTimer = null;

          runInjections();

          /*
           * The cards a listing just drew, given cars to be about. FINN adds
           * them as the reader scrolls, and the ones it rendered on its own
           * server never passed through the interceptor at all.
           */
          void ensurePageCars();
        }, 100);
      });

      activeObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };

    const handleNavigation = () => {
      runInjections();
      startObserving();

      /* Whatever this page already shows, before anyone asks about it. */
      void ensurePageCars();

      if (document.querySelector(HOME_PAGE_SELECTOR)) {
        console.info("[FinnLens] home page detected");
      } else if (document.querySelector(LISTINGS_PAGE_SELECTOR)) {
        console.info("[FinnLens] listings page detected");
      } else if (document.querySelector(DETAILS_PAGE_SELECTOR)) {
        console.info("[FinnLens] product details page detected");
      }
    };

    /**
     * What counts as having moved to another car: the path, plus the
     * configuration the query names. Everything else in the query is filters
     * and sort order, which FINN rewrites constantly.
     */
    const pageKey = (href: string): string => {
      try {
        const url = new URL(href);

        return `${url.pathname}?${url.searchParams.get("selected_config") ?? ""}`;
      } catch {
        return href;
      }
    };

    let lastPageKey = pageKey(window.location.href);

    const onNavigate = () => {
      const key = pageKey(window.location.href);
      const moved = key !== lastPageKey;

      lastPageKey = key;

      /* A drawer still describing the car the reader has just left is worse than none. */
      if (moved) {
        closeDrawer();
        /* A new page may show cars the last one couldn't get; let it try again. */
        forgetAsked();
      }

      if (navDebounceTimer !== null) {
        clearTimeout(navDebounceTimer);
      }

      navDebounceTimer = setTimeout(() => {
        navDebounceTimer = null;
        handleNavigation();
        notifyPageChanged();
      }, 150);
    };

    window.addEventListener("finnlens:navigate", onNavigate);

    /*
     * Two things in storage change what the page shows:
     *
     * - **The active chat, or what it judged.** The chips follow the chat open
     *   in the bubble, and come off when it has no judgement.
     * - **The cars.** More of them reaching Lens means the chat's "cars on
     *   this page" grew, so an open chat is told to re-read the page.
     *
     * And one asks for something: a request to open the bubble here.
     */
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;

      if (CHATS_KEY in changes || ACTIVE_CHAT_KEY in changes) {
        void refreshChips().catch(reportChipFailure);
      }

      if ("loadedCarsFromFinnApi" in changes) notifyPageChanged();

      if (OPEN_BUBBLE_KEY in changes && changes[OPEN_BUBBLE_KEY]?.newValue) {
        void openIfAsked();
      }
    });

    const openIfAsked = async () => {
      /* Only the tab the reader is looking at answers; the others leave the request for it. */
      if (document.visibilityState !== "visible") return;
      if (!(await takeOpenRequest())) return;

      await syncChatBubble();
      setChatOpen(true);
    };

    handleNavigation();
    void refreshChips().catch(reportChipFailure);

    /* Just installed: the bubble opens by itself. */
    void openIfAsked();
    document.addEventListener("visibilitychange", () => void openIfAsked());
  },
});

/**
 * A chip that couldn't be drawn is worth a line in the console and nothing
 * more: FINN's page is unaffected, and the reader has lost a verdict rather
 * than the use of the site.
 */
function reportChipFailure(error: unknown) {
  console.error("[FinnLens] couldn't put Lens's verdicts on these cards", error);
}
