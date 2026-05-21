import { injectPinCarButtonIntoNode } from "./injectPinCarButtonIntoNode"

export function injectPinBtnIntoCarListItem(currentCarCardElement: HTMLElement) {
  if (currentCarCardElement.dataset.finnLensProcessed === "true") return;
  currentCarCardElement.dataset.finnLensProcessed = "true";
  injectPinCarButtonIntoNode(currentCarCardElement)
}
