export const PANEL_RESIZE_KEYBOARD_STEP = 10;
export const PANEL_RESIZE_KEYBOARD_LARGE_STEP = 30;
export const PANEL_RESIZE_TOUCH_RESET_MS = 400;

const roundSize = (value: number) => Math.round(value * 100) / 100;

export function normalizePanelSizes(sizes: readonly number[]): number[] | null {
  if (sizes.length < 2 || sizes.some((size) => !Number.isFinite(size) || size <= 0)) return null;

  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (!Number.isFinite(total) || total <= 0) return null;

  return sizes.map((size) => roundSize((size / total) * 1000));
}

export function resizeAdjacentPanels({
  sizes,
  minimums,
  maximums,
  dividerIndex,
  delta,
}: {
  sizes: readonly number[];
  minimums: readonly number[];
  maximums?: readonly (number | undefined)[];
  dividerIndex: number;
  delta: number;
}): number[] {
  if (
    sizes.length !== minimums.length ||
    dividerIndex < 0 ||
    dividerIndex >= sizes.length - 1 ||
    sizes.some((size) => !Number.isFinite(size) || size <= 0)
  )
    return [...sizes];

  const left = sizes[dividerIndex] ?? 0;
  const right = sizes[dividerIndex + 1] ?? 0;
  const total = left + right;
  const leftMinimum = Math.max(0, minimums[dividerIndex] ?? 0);
  const rightMinimum = Math.max(0, minimums[dividerIndex + 1] ?? 0);
  const leftMaximum = maximums?.[dividerIndex] ?? Number.POSITIVE_INFINITY;
  const rightMaximum = maximums?.[dividerIndex + 1] ?? Number.POSITIVE_INFINITY;
  const lowerBound = Math.max(leftMinimum, total - rightMaximum);
  const upperBound = Math.min(leftMaximum, total - rightMinimum);

  if (upperBound < lowerBound) return [...sizes];

  const nextLeft = roundSize(Math.min(upperBound, Math.max(lowerBound, left + delta)));
  const next = [...sizes];
  next[dividerIndex] = nextLeft;
  next[dividerIndex + 1] = roundSize(total - nextLeft);
  return next;
}

export function keyboardPanelDelta({
  key,
  shiftKey,
  leftSize,
  rightSize,
  leftMinimum,
  rightMinimum,
  leftMaximum,
  rightMaximum,
}: {
  key: string;
  shiftKey: boolean;
  leftSize: number;
  rightSize: number;
  leftMinimum: number;
  rightMinimum: number;
  leftMaximum?: number;
  rightMaximum?: number;
}): number | undefined {
  const step = shiftKey ? PANEL_RESIZE_KEYBOARD_LARGE_STEP : PANEL_RESIZE_KEYBOARD_STEP;
  const total = leftSize + rightSize;
  const minimum = Math.max(leftMinimum, total - (rightMaximum ?? Number.POSITIVE_INFINITY));
  const maximum = Math.min(leftMaximum ?? Number.POSITIVE_INFINITY, total - rightMinimum);

  if (key === "ArrowLeft") return -step;
  if (key === "ArrowRight") return step;
  if (key === "Home") return minimum - leftSize;
  if (key === "End") return maximum - leftSize;
  return undefined;
}

export function isPanelTouchReset(previousTapAt: number | undefined, currentTapAt: number): boolean {
  if (previousTapAt === undefined) return false;
  const elapsed = currentTapAt - previousTapAt;
  return elapsed > 0 && elapsed <= PANEL_RESIZE_TOUCH_RESET_MS;
}

export function panelSizeStorageKey(layoutId: string, panelId: string): string {
  return `panel:${layoutId}:${panelId}`;
}

export function readStoredPanelSizes(
  widths: Readonly<Record<string, number>> | undefined,
  layoutId: string,
  panelIds: readonly string[],
  normalize = true,
): number[] | null {
  if (!widths) return null;
  const sizes = panelIds.map((panelId) => widths[panelSizeStorageKey(layoutId, panelId)] ?? Number.NaN);
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) return null;
  return normalize ? normalizePanelSizes(sizes) : sizes;
}

export function mergeStoredPanelSizes(
  widths: Readonly<Record<string, number>>,
  layoutId: string,
  panelIds: readonly string[],
  sizes: readonly number[] | null,
  normalize = true,
): Record<string, number> {
  const next = Object.fromEntries(Object.entries(widths).filter(([key]) => !key.startsWith(`panel:${layoutId}:`)));
  const storedSizes = sizes ? (normalize ? normalizePanelSizes(sizes) : [...sizes]) : null;
  if (
    !storedSizes ||
    storedSizes.length !== panelIds.length ||
    storedSizes.some((size) => !Number.isFinite(size) || size <= 0)
  )
    return next;

  panelIds.forEach((panelId, index) => {
    next[panelSizeStorageKey(layoutId, panelId)] = roundSize(storedSizes[index] ?? 0);
  });
  return next;
}

export function proportionalPanelTemplate(
  sizes: readonly number[] | null,
  minimums: readonly number[],
  defaultTemplate: string,
): string {
  const normalized = sizes ? normalizePanelSizes(sizes) : null;
  if (!normalized || normalized.length !== minimums.length) return defaultTemplate;

  return normalized.map((size, index) => `minmax(${minimums[index] ?? 0}px, ${Math.max(0.01, size)}fr)`).join(" 1px ");
}

export function fixedFirstPanelTemplate(
  sizes: readonly number[] | null,
  minimums: readonly number[],
  maximums: readonly (number | undefined)[],
  defaultTemplate: string,
): string {
  if (!sizes || sizes.length !== 2) return defaultTemplate;

  const preferred = Math.max(minimums[0] ?? 0, Math.min(maximums[0] ?? Number.POSITIVE_INFINITY, sizes[0] ?? 0));
  const leftMinimum = minimums[0] ?? 0;
  const rightMinimum = minimums[1] ?? 0;
  const leftMaximum = maximums[0];
  const dynamicMaximum = `calc(100% - ${rightMinimum + 1}px)`;
  const maximum = leftMaximum === undefined ? dynamicMaximum : `min(${leftMaximum}px, ${dynamicMaximum})`;

  return `clamp(${leftMinimum}px, ${roundSize(preferred)}px, ${maximum}) 1px minmax(${rightMinimum}px, 1fr)`;
}
