import type { ToastType } from "../types";
import { createToast } from "../creators";

export function injectToast(message: string, type: ToastType) {
  const existing = document.querySelector(".finn-lens-toast");
  if (existing) existing.remove();

  const toast = createToast(message, type);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 200ms";
  }, 1800);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}