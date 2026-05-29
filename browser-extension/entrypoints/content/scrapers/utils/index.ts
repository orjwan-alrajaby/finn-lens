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

export function calculateDiscount(
  newPrice: number | null,
  oldPrice: number | null
) {
  if (
    oldPrice == null ||
    newPrice == null ||
    !Number.isFinite(newPrice) ||
    !Number.isFinite(oldPrice) ||
    oldPrice <= 0 ||
    newPrice >= oldPrice
  ) {
    return null;
  }

  const amount = oldPrice - newPrice;

  return {
    percentage: `${Math.round((amount / oldPrice) * 100)}%`,
    amount,
  };
}