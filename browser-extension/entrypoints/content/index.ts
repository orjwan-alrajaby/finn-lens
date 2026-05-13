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

    // check if we're currently on the details page
    const detailsPage = document.querySelector('div[data-appid="product-details"]');
    if (detailsPage) {
      console.info("you are currently on the details page!");
      const allDivs = document.querySelectorAll("div");
      const titleContainer = Array.from(allDivs).find(div => Array.from(div.children).find(child => child.nodeName.toLowerCase() === "h1"));
      titleContainer?.classList.add("relative");
      const containerAlreadyHasButton = titleContainer?.querySelector(".finn-lens-add-car-btn");
      if (!titleContainer || containerAlreadyHasButton) return;
      injectAddCarButtonForNode(titleContainer);
      // TODO: there's an issue with the logic of "injectAddCarButtonForNode"
      // We need to adjust it to accommodate for both details page and listings.

    }
  },
});

function injectAllExistingCards() {
  document
    .querySelectorAll('[data-testid="product-card"]')
    .forEach((el) => {
      injectAddCarButtonForNode(el as HTMLElement);
    });
}