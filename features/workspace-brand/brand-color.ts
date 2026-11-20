import type { CSSProperties } from "react";

const BRAND_COLOR = /^#[0-9a-f]{6}$/u;
const BLACK = "black";
const WHITE = "white";

export function isBrandColor(value: unknown): value is string {
  return typeof value === "string" && BRAND_COLOR.test(value);
}

function channel(value: number): number {
  const share = value / 255;
  return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
}

export function brandLuminance(color: string): number {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function brandForeground(color: string): typeof BLACK | typeof WHITE {
  const luminance = brandLuminance(color);
  const onBlack = (luminance + 0.05) / 0.05;
  const onWhite = 1.05 / (luminance + 0.05);
  return onBlack >= onWhite ? BLACK : WHITE;
}

export function brandStyle(accentColor: string | null | undefined): CSSProperties | undefined {
  if (!isBrandColor(accentColor)) return undefined;
  return { "--primary": accentColor, "--primary-foreground": brandForeground(accentColor) } as CSSProperties;
}
