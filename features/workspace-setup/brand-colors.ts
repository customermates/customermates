import type { ChipColor } from "@/constants/chip-colors";
import { colorPalettes } from "@/styles/color-palettes";
import type { ChartColor } from "@/features/widget/widget-display.schema";

export type BrandColorSource = "themeColor" | "manifest" | "customProperty" | "button";
export type BrandColorCandidate = { hex: string; source: BrandColorSource; score: number };
export type BrandColorInput = { html: string; stylesheets?: string[]; manifest?: string | null };
export type BrandColorMapping = { hex: string; chip: ChipColor; chart: ChartColor };

type Rgb = { r: number; g: number; b: number };
type Lab = { l: number; a: number; b: number };

const SOURCE_WEIGHTS: Record<BrandColorSource, number> = { themeColor: 5, manifest: 4, customProperty: 3, button: 2 };
const MAX_INPUT = 500_000;
const BRAND_PROPERTY = /--[\w-]*(?:primary|brand|accent|main|theme|highlight)[\w-]*/i;
const BUTTON_SELECTOR =
  /(?:^|[\s,>+~])(?:button|\.btn[\w-]*|\.button[\w-]*|\[type=["']?submit["']?\]|\.cta[\w-]*)(?=[\s,:.#[>+~]|$)/i;
const COLOR_PATTERN = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|rgba?\([^)]{5,60}\)|hsla?\([^)]{5,60}\)/gi;

const CHIP_REFERENCES: Record<ChipColor, string> = {
  default: colorPalettes.light.primary.DEFAULT,
  secondary: colorPalettes.light.default["700"],
  destructive: colorPalettes.light.danger.DEFAULT,
  success: colorPalettes.light.success.DEFAULT,
  warning: colorPalettes.light.warning.DEFAULT,
  info: colorPalettes.light.focus,
};

const CHART_HUES = ["default", "primary", "secondary", "success", "warning", "danger"] as const;
const CHART_REFERENCES = Object.fromEntries(
  CHART_HUES.flatMap((hue) =>
    (["400", "500", "600"] as const).map((shade, index) => [`${hue}${index + 1}`, colorPalettes.dark[hue][shade]]),
  ),
) as Record<ChartColor, string>;

function channel(value: string, scale: number): number {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (!Number.isFinite(number)) return Number.NaN;
  return trimmed.endsWith("%") ? (number / 100) * scale : number;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

export function parseCssColor(value: string): Rgb | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      if (hex.length === 4 && hex[3] !== "f") return null;
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
    }
    if (hex.length === 6 || (hex.length === 8 && parseInt(hex.slice(6), 16) >= 200))
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    return null;
  }
  const functional = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (!functional) return null;
  const parts = functional[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  if (parts[3] !== undefined && channel(parts[3], 1) < 0.8) return null;
  if (functional[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((part) => channel(part, 255));
    return [r, g, b].every((part) => Number.isFinite(part) && part >= 0 && part <= 255) ? { r, g, b } : null;
  }
  const h = Number.parseFloat(parts[0]);
  const s = channel(parts[1], 1);
  const l = channel(parts[2], 1);
  if (![h, s, l].every(Number.isFinite) || s < 0 || s > 1 || l < 0 || l > 1) return null;
  return hslToRgb(((h % 360) + 360) % 360, s, l);
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

function linear(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function toOklab(color: Rgb): Lab {
  const r = linear(color.r);
  const g = linear(color.g);
  const b = linear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function distance(left: Lab, right: Lab): number {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

function isBrandLike(color: Rgb): boolean {
  const lab = toOklab(color);
  return Math.hypot(lab.a, lab.b) >= 0.04 && lab.l > 0.2 && lab.l < 0.95;
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

function cssRules(css: string): Array<{ selector: string; body: string }> {
  const rules: Array<{ selector: string; body: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(pattern))
    rules.push({ selector: match[1].trim(), body: match[2] });
  return rules;
}

function declarations(body: string): Array<{ property: string; value: string }> {
  return body
    .split(";")
    .map((part) => part.split(":"))
    .filter((part) => part.length >= 2)
    .map(([property, ...value]) => ({ property: property.trim().toLowerCase(), value: value.join(":").trim() }));
}

function manifestThemeColor(manifest: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(manifest.slice(0, MAX_INPUT));
    const value = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).theme_color : undefined;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function extractBrandColors(input: BrandColorInput): BrandColorCandidate[] {
  const html = input.html.slice(0, MAX_INPUT);
  const found = new Map<string, BrandColorCandidate>();
  const add = (value: string | undefined, source: BrandColorSource) => {
    if (!value) return;
    for (const match of value.matchAll(COLOR_PATTERN)) {
      const color = parseCssColor(match[0]);
      if (!color || !isBrandLike(color)) continue;
      const hex = toHex(color);
      const current = found.get(hex);
      found.set(hex, {
        hex,
        source: current && SOURCE_WEIGHTS[current.source] > SOURCE_WEIGHTS[source] ? current.source : source,
        score: (current?.score ?? 0) + SOURCE_WEIGHTS[source],
      });
    }
  };
  for (const match of html.matchAll(/<meta\b[^>]*>/gi))
    if (attribute(match[0], "name")?.toLowerCase() === "theme-color") add(attribute(match[0], "content"), "themeColor");
  if (input.manifest) add(manifestThemeColor(input.manifest), "manifest");
  const css = [
    ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]),
    ...(input.stylesheets ?? []).map((sheet) => sheet.slice(0, MAX_INPUT)),
  ];
  for (const sheet of css) {
    for (const rule of cssRules(sheet)) {
      const button = BUTTON_SELECTOR.test(rule.selector);
      for (const { property, value } of declarations(rule.body)) {
        if (property.startsWith("--") && BRAND_PROPERTY.test(property)) add(value, "customProperty");
        else if (button && (property === "background" || property === "background-color")) add(value, "button");
      }
    }
  }
  return [...found.values()].sort((left, right) => right.score - left.score || (left.hex < right.hex ? -1 : 1));
}

function nearest<T extends string>(hex: string, references: Record<T, string>): T {
  const target = parseCssColor(hex);
  if (!target) throw new Error("Invalid brand colour.");
  const lab = toOklab(target);
  let best: { key: T; distance: number } | null = null;
  for (const [key, value] of Object.entries(references) as Array<[T, string]>) {
    const reference = parseCssColor(value);
    if (!reference) continue;
    const gap = distance(lab, toOklab(reference));
    if (!best || gap < best.distance) best = { key, distance: gap };
  }
  if (!best) throw new Error("No reference colours.");
  return best.key;
}

export function nearestChipColor(hex: string): ChipColor {
  return nearest(hex, CHIP_REFERENCES);
}

export function nearestChartColor(hex: string): ChartColor {
  return nearest(hex, CHART_REFERENCES);
}

export function mapBrandColors(input: BrandColorInput): BrandColorMapping | null {
  const [primary] = extractBrandColors(input);
  return primary
    ? { hex: primary.hex, chip: nearestChipColor(primary.hex), chart: nearestChartColor(primary.hex) }
    : null;
}
