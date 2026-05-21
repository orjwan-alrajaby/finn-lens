import "@/assets/tailwind.css";
import { injectPinBtnIntoDetailsPage } from "./injectors/inject-pin-button/injectPinBtnIntoDetailsPage"
import { injectPinBtnIntoCarListItem } from "./injectors/inject-pin-button/injectPinBtnIntoCarListItem"

export default defineContentScript({
  matches: ["https://www.finn.com/*"],

  main() {
    console.info("[FinnLens] content script loaded");

    injectAllExistingCards();

    const isDetailsPage = document.querySelector('div[data-appid="product-details"]');

    if (isDetailsPage) {
      const observer = new MutationObserver((_mutations) => {
        injectPinBtnIntoDetailsPage();
        injectAllExistingCards();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      return;
    }

    const isListingsPage = document.querySelector('div[data-testid="product-listing"]');
    const isHomePage = document.querySelector('div[data-testid="hero2"]');
    
    if (isListingsPage || isHomePage) {
      console.info("You're in 'listing page' or 'home page' right now...");
      injectAllExistingCards();
      const observer = new MutationObserver((mutations) => {
        const cardsToProcess = new Set<HTMLElement>();

        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;

            if (node.matches('div[data-testid="product-card"]')) {
              cardsToProcess.add(node);
            }

            node
              .querySelectorAll?.('div[data-testid="product-card"]')
              .forEach((el) => {
                cardsToProcess.add(el as HTMLElement);
              });
          }
        }

        Array.from(cardsToProcess).forEach((card) =>
          injectPinBtnIntoCarListItem(card)
        )
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  },
});

function injectAllExistingCards() {
  document
    .querySelectorAll('div[data-testid="product-card"]')
    .forEach((el) => {
      injectPinBtnIntoCarListItem(el as HTMLElement);
    });
}
