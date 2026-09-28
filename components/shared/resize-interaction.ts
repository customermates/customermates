const RESIZE_KEYBOARD_STEP = 10;
const RESIZE_KEYBOARD_LARGE_STEP = 30;
const RESIZE_DOUBLE_TAP_MS = 400;

export const roundResizeSize = (value: number) => Math.round(value * 100) / 100;

export function resizeKeyboardStep(largeStep: boolean) {
  return largeStep ? RESIZE_KEYBOARD_LARGE_STEP : RESIZE_KEYBOARD_STEP;
}

export function isResizeDoubleTap(previousTapAt: number | undefined, currentTapAt: number) {
  if (previousTapAt === undefined) return false;
  const elapsed = currentTapAt - previousTapAt;
  return elapsed > 0 && elapsed <= RESIZE_DOUBLE_TAP_MS;
}
