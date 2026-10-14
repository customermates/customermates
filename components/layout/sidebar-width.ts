import { resizeKeyboardStep } from "@/components/shared/resize-interaction";

export const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar_width";
const SIDEBAR_WIDTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 208;
export const SIDEBAR_MAX_WIDTH = 384;

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
}

export function parseSidebarWidth(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const width = Number(value);
  return Number.isFinite(width) ? clampSidebarWidth(width) : undefined;
}

export function sidebarWidthCookie(width: number | null): string {
  if (width === null) return `${SIDEBAR_WIDTH_COOKIE_NAME}=; path=/; max-age=0`;
  return `${SIDEBAR_WIDTH_COOKIE_NAME}=${clampSidebarWidth(width)}; path=/; max-age=${SIDEBAR_WIDTH_COOKIE_MAX_AGE}`;
}

export function keyboardSidebarWidth(key: string, shiftKey: boolean, width: number): number | undefined {
  if (key === "ArrowLeft") return clampSidebarWidth(width - resizeKeyboardStep(shiftKey));
  if (key === "ArrowRight") return clampSidebarWidth(width + resizeKeyboardStep(shiftKey));
  if (key === "Home") return SIDEBAR_MIN_WIDTH;
  if (key === "End") return SIDEBAR_MAX_WIDTH;
  return undefined;
}
