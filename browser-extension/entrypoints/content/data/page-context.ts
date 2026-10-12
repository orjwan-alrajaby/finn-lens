import { HOME_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR, DETAILS_PAGE_SELECTOR } from "../constants";
import { isConfigCardId } from "./utils";

export interface PageContext {
  isHomePage: boolean;
  isListingsPage: boolean;
  isDetailsPage: HTMLElement | null;
  anchorElementIsAListItem: boolean;
  /** A config-comparison card on the details page, identified by its own
   * `id="product-XXXXX"` — carries its config id directly, no URL needed. */
  anchorElementIsAConfigCardItem: boolean;
}

export function getPageContext(anchorElement: HTMLElement): PageContext {
  return {
    isHomePage: Boolean(document.querySelector(HOME_PAGE_SELECTOR)),
    isListingsPage: Boolean(document.querySelector(LISTINGS_PAGE_SELECTOR)),
    isDetailsPage: document.querySelector<HTMLElement>(DETAILS_PAGE_SELECTOR),
    anchorElementIsAListItem: Boolean(anchorElement.querySelector("h3")),
    anchorElementIsAConfigCardItem: isConfigCardId(anchorElement.id),
  };
}