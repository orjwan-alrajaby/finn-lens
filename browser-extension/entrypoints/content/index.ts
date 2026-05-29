import "@/assets/tailwind.css";
import { injectPinBtnIntoDetailsPage } from "./injectors/inject-pin-button/injectPinBtnIntoDetailsPage";
import { injectPinBtnIntoCarListItem } from "./injectors/inject-pin-button/injectPinBtnIntoCarListItem";
import { HOME_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR, DETAILS_PAGE_SELECTOR } from "./constants"

export default defineContentScript({
  matches: ["https://www.finn.com/*"],

  main() {
    console.info("[FinnLens] content script loaded");

    let activeObserver: MutationObserver | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    // ── 1. Patch History API to detect SPA navigations ──────────────────────
    // Patching history here means wrapping the browser’s SPA navigation methods 
    // so my extension gets notified whenever the site changes pages without an actual page reload
    const patchHistory = (method: "pushState" | "replaceState") => {
      const original = history[method].bind(history);
      history[method] = (...args: Parameters<typeof history.pushState>) => {
        original(...args);
        window.dispatchEvent(new Event("finnlens:navigate"));
      };
    };

    patchHistory("pushState");
    patchHistory("replaceState");
    window.addEventListener("popstate", () =>
      window.dispatchEvent(new Event("finnlens:navigate"))
    );

    // ── 2. Re-evaluate page type and (re)configure injection ─────────────────
    const handleNavigation = () => {
      // Disconnect stale observer from previous page
      activeObserver?.disconnect();
      activeObserver = null;

      injectAllExistingCards();

      const isHomePage = document.querySelector(HOME_PAGE_SELECTOR);
      const isListingsPage = document.querySelector(LISTINGS_PAGE_SELECTOR);
      const isDetailsPage = document.querySelector(DETAILS_PAGE_SELECTOR);

      if (isDetailsPage) {
        console.info("[FinnLens] product details page detected");
        setTimeout(() => {
          injectAllExistingCards();
        }, 1500)

        injectPinBtnIntoDetailsPage();

        activeObserver = new MutationObserver(() => {
          injectPinBtnIntoDetailsPage();
        });
        activeObserver.observe(document.body, { childList: true, subtree: true });
        return;
      }

      if (isListingsPage || isHomePage) {
        console.info("[FinnLens] listing / home page detected");

        activeObserver = new MutationObserver((mutations) => {
          const newCards = new Set<HTMLElement>();
          for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (!(node instanceof HTMLElement)) continue;
              if (node.matches('div[data-testid="product-card"]')) {
                newCards.add(node);
              }
              node
                .querySelectorAll<HTMLElement>('div[data-testid="product-card"]')
                .forEach((card) => newCards.add(card));
            }
          }
          newCards.forEach((card) => injectPinBtnIntoCarListItem(card));
        });
        activeObserver.observe(document.body, { childList: true, subtree: true });
      }
    };

    // ── 3. Debounced handler for finnlens:navigate ────────────────────────────
    // FINN's router may fire multiple history events in quick succession; debounce
    // ensures handleNavigation runs once after the DOM has settled.
    const onNavigate = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        handleNavigation();
      }, 150);
    };

    window.addEventListener("finnlens:navigate", onNavigate);

    // ── 4. Run immediately for the initial page load ──────────────────────────
    handleNavigation();
  },
});

function injectAllExistingCards() {
  const cards = document.body.querySelectorAll<HTMLDivElement>('div[data-testid="product-card"]');
  cards?.forEach((card) => injectPinBtnIntoCarListItem(card));
}