import { injectPinCarButtonIntoNode } from "./injectPinCarButtonIntoNode"

export function injectPinBtnIntoDetailsPage() {
  const root = document.body.querySelector<HTMLDivElement>('div[data-appid="product-details"]');
  if (!root || root.dataset.finnLensInjected === "true") return;
  root.dataset.finnLensInjected = "true";

  const allDivs = root.querySelectorAll("div");
  const anchorElement = Array.from(allDivs).find(div => Array.from(div.children).find(child => child.nodeName.toLowerCase() === "h1"));

  if (!anchorElement) return;

  injectPinCarButtonIntoNode(anchorElement);
}