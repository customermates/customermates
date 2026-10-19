export const DEFAULT_CLUSTER_COLOR = "var(--primary)";
export const MIXED_CLUSTER_COLOR = "color-mix(in srgb, var(--foreground) 50%, var(--card))";

export const MAP_COLOR_TOKENS = {
  land: "var(--card)",
  border: "var(--border)",
  label: "var(--muted-foreground)",
  halo: "var(--card)",
  lightText: "var(--card)",
  darkText: "var(--foreground)",
} as const;

export type MapPalette = { land: string; border: string; label: string; halo: string };

export type Rgba = { r: number; g: number; b: number; a: number };

const FUNCTIONAL_COLOR = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;
const SRGB_COLOR = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i;

function alphaOf(value: string | undefined) {
  if (value === undefined) return 1;
  return value.endsWith("%") ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
}

export function parseColor(value: string): Rgba | null {
  const functional = FUNCTIONAL_COLOR.exec(value.trim());
  if (functional)
    return { r: Number(functional[1]), g: Number(functional[2]), b: Number(functional[3]), a: alphaOf(functional[4]) };
  const srgb = SRGB_COLOR.exec(value.trim());
  if (srgb)
    return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: alphaOf(srgb[4]) };
  return null;
}

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgba) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(left: Rgba, right: Rgba) {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function readableTextToken(background: Rgba | null, light: Rgba | null, dark: Rgba | null) {
  if (!background || !light || !dark) return MAP_COLOR_TOKENS.lightText;
  return contrastRatio(background, light) >= contrastRatio(background, dark)
    ? MAP_COLOR_TOKENS.lightText
    : MAP_COLOR_TOKENS.darkText;
}

export function resolveColor(probe: HTMLElement, expression: string) {
  probe.style.color = "";
  probe.style.color = expression;
  return getComputedStyle(probe).color;
}

export function resolvePalette(probe: HTMLElement): MapPalette {
  return {
    land: resolveColor(probe, MAP_COLOR_TOKENS.land),
    border: resolveColor(probe, MAP_COLOR_TOKENS.border),
    label: resolveColor(probe, MAP_COLOR_TOKENS.label),
    halo: resolveColor(probe, MAP_COLOR_TOKENS.halo),
  };
}

export function textTokenResolver(probe: HTMLElement) {
  const cache = new Map<string, string>();
  const light = parseColor(resolveColor(probe, MAP_COLOR_TOKENS.lightText));
  const dark = parseColor(resolveColor(probe, MAP_COLOR_TOKENS.darkText));
  return (color: string) => {
    const known = cache.get(color);
    if (known) return known;
    const token = readableTextToken(parseColor(resolveColor(probe, color)), light, dark);
    cache.set(color, token);
    return token;
  };
}
