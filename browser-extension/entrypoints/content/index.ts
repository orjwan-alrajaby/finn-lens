import "@/assets/tailwind.css";
import { injectAddCarButtonForNode } from "./manipulate-ui";

export default defineContentScript({
  matches: ["https://www.finn.com/*"],
  main() {
    console.info("[FinnLens] content script loaded");

    // first pass (runs only once)
    injectAllExistingCards();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;

          // direct card
          if (node.matches('[data-testid="product-card"]')) {
            injectAddCarButtonForNode(node);
          }

          // nested cards (important for React lists)
          node
            .querySelectorAll?.('[data-testid="product-card"]')
            .forEach((el) => {
              injectAddCarButtonForNode(el as HTMLElement);
            });
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});

function injectAllExistingCards() {
  document
    .querySelectorAll('[data-testid="product-card"]')
    .forEach((el) => {
      injectAddCarButtonForNode(el as HTMLElement);
    });
}