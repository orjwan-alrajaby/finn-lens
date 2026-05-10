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
    "add-car-btn",
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

export function showToast(message: string) {
  const existing = document.querySelector(".finn-lens-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className =
    "finn-lens-toast fixed bottom-6 right-6 z-[99999] bg-[#07182F] text-white px-4 py-3 rounded-2xl shadow-lg text-sm";

  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 200ms";
  }, 1800);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

export function injectAddCarButtonForNode(currentCarCardElement: HTMLElement) {
  if (currentCarCardElement.dataset.finnLensProcessed === "true") return;
  currentCarCardElement.dataset.finnLensProcessed = "true";

  const linkEl =
    currentCarCardElement.querySelector("h3 a") ||
    currentCarCardElement.querySelector("a[href*='/']");

  const carUrl = linkEl?.getAttribute("href");
  if (!carUrl) return;

  currentCarCardElement.classList.add("relative");

  const button = createAddButton();

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    showToast(`Pinned: Toyota Yaris`);
  });

  currentCarCardElement.appendChild(button);
}