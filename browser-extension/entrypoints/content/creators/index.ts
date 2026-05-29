import type { ToastType } from "../types";

export function createAddButton(): HTMLButtonElement {
  const button = document.createElement("button");

  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
      stroke-width="1.5" stroke="currentColor" class="size-4">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"/>
    </svg>
  `;

  button.className = [
    "finn-lens-add-car-btn",
    "flex items-center justify-center",
    "p-2 rounded-full",
    "absolute top-5 right-5 z-[9999]",
    "border cursor-pointer",
    "!text-[#1B66D2]",
    "!bg-[#EAF3FF]",
    "!border-[#1B66D2]",
    "hover:scale-105 active:scale-95 transition",
  ].join(" ");

  return button;
}

const toastClasses = {
  info: "bg-[#0167d4]",
  success: "bg-[#26bc58]",
  warning: "bg-[#f0a500]",
  error: "bg-[#e71d3f]",
}

export function createToast(message: string, type: ToastType ) {
  const toast = document.createElement("div");
  const toastBaseClasses = "finn-lens-toast fixed bottom-6 right-6 z-[999] px-4 py-3 text-white rounded-2xl shadow-lg text-sm";
  const toastTypeClasses = toastClasses[type];
  toast.className = toastBaseClasses;
  toast.classList.add(toastTypeClasses)
  toast.textContent = message;
  return toast;
}