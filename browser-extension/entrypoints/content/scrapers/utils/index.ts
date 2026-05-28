export function extractFilename(url: string) {
  return url.split("/").pop()?.split("?")[0] ?? "";
}

export function removeDuplicateImages(images: string[]) {
  const seen = new Set<string>();

  return images.filter((imageUrl) => {
    const filename = extractFilename(imageUrl);

    if (!filename) {
      return false;
    }

    if (seen.has(filename)) {
      return false;
    }

    seen.add(filename);

    return true;
  });
}

export function calculateDiscount(newPrice: number | null, oldPrice: number | null) {
  if (
    (typeof newPrice !== "number" && !newPrice) ||
    (typeof oldPrice !== "number" && !oldPrice) ||
    oldPrice <= 0
  ) return null;
  const amount = oldPrice - newPrice;
  if (amount <= 0) return null;
  const discount = (amount / oldPrice) * 100;
  const rounded = Math.round(discount);
  return { percentage: `${rounded}%`, amount };
}