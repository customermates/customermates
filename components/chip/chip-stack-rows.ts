export function visibleChipRows(
  widths: number[],
  availableWidth: number,
  maxRows: number,
  gap: number,
  moreWidth: (hiddenCount: number) => number,
  extraCount = 0,
) {
  for (let count = widths.length; count >= 0; count--) {
    const hiddenCount = widths.length - count + extraCount;
    const sizes = widths.slice(0, count);
    if (hiddenCount > 0) sizes.push(moreWidth(hiddenCount));
    let rows = 1;
    let used = 0;
    for (const size of sizes) {
      const width = Math.min(size, availableWidth);
      if (used > 0 && used + gap + width > availableWidth) {
        rows++;
        used = width;
      } else used += (used > 0 ? gap : 0) + width;
    }
    if (rows <= maxRows) return count;
  }
  return 0;
}
