import type { CarsType } from "@/types";
import { createAddButton } from "../../creators";
import { injectToast } from "../injectToast";
import {
  extractFullCarDetails,
  getCarInformationFromDetailsPage,
} from "../../scrapers";
import { HOME_PAGE_SELECTOR, LISTINGS_PAGE_SELECTOR, DETAILS_PAGE_SELECTOR } from "../../constants"

function getCarName(element: HTMLElement) {
  return element.querySelector("h3")?.textContent?.trim() ?? null;
}

function getCarUrl(element: HTMLElement) {
  const linkElement =
    element.querySelector("h3 a") ||
    element.querySelector("a[href*='/']");

  return linkElement?.getAttribute("href") ?? null;
}

async function handlePinButtonClick(
  event: MouseEvent,
  anchorElement: HTMLElement,
) {
  event.preventDefault();
  event.stopPropagation();

  const isDetailsPage = document.querySelector(DETAILS_PAGE_SELECTOR);
  const isListingsPage = document.querySelector(LISTINGS_PAGE_SELECTOR);
  const isHomePage = document.querySelector(HOME_PAGE_SELECTOR);

  const isListItemCard =
    anchorElement.getAttribute("data-testid") === "product-card";

  const shouldScrapeFromCard =
    isListItemCard || isListingsPage || isHomePage;

  const { pinnedCars = [] }: { pinnedCars: CarsType } =
    await browser.storage.local.get("pinnedCars");

  const removePinnedCar = async (carName: string | null) => {
    const updatedCars = pinnedCars.filter(
      (car) => car.name !== carName,
    );

    await browser.storage.local.set({
      pinnedCars: updatedCars,
    });

    injectToast(`Unpinned: ${carName}`, "info");
  };

  const isCarPinned = (carName: string | null) =>
    pinnedCars.some((car) => car.name === carName);

  const carName = shouldScrapeFromCard
    ? getCarName(anchorElement)
    : document.querySelector("h1")?.textContent?.trim() ?? null;

  if (isCarPinned(carName)) {
    await removePinnedCar(carName);
    return;
  }

  injectToast(`Pinning ${carName}...`, "info");

  let carDetails;

  if (shouldScrapeFromCard) {
    const carUrl = getCarUrl(anchorElement);

    if (!carUrl) {
      return;
    }

    carDetails = await extractFullCarDetails(
      carUrl,
      anchorElement,
    );
  }

  if (isDetailsPage && !shouldScrapeFromCard) {
    const root = document.querySelector(
      DETAILS_PAGE_SELECTOR,
    ) as HTMLElement;

    carDetails = await getCarInformationFromDetailsPage(root);
  }

  if (!carDetails?.name) {
    return;
  }

  await browser.storage.local.set({
    pinnedCars: [...pinnedCars, carDetails],
  });

  injectToast(`Pinned: ${carDetails.name}`, "info");
}

export function injectPinCarButtonIntoNode(
  anchorElement: HTMLElement,
) {
  const containerAlreadyHasButton =
    anchorElement.querySelector(".finn-lens-add-car-btn");

  if (containerAlreadyHasButton) {
    return;
  }

  anchorElement.classList.add("relative");

  const button = createAddButton();

  button.addEventListener("click", (event) =>
    handlePinButtonClick(event, anchorElement),
  );

  anchorElement.appendChild(button);

  const detailsPage = document.querySelector<HTMLDivElement>(DETAILS_PAGE_SELECTOR);

  if (detailsPage) {
    detailsPage.dataset.finnLensInjected = "true";
  }

  if (!anchorElement.querySelector("h1")) {
    anchorElement.dataset.finnLensInjected = "true";
  }
}