import { describe, expect, it } from "vitest";

import { MAP_COLOR_TOKENS, contrastRatio, parseColor, readableTextToken, relativeLuminance } from "../map-palette";

const white = { r: 255, g: 255, b: 255, a: 1 };
const black = { r: 0, g: 0, b: 0, a: 1 };

describe("map palette", () => {
  it("parses the colour formats browsers compute", () => {
    expect(parseColor("rgb(216, 144, 31)")).toEqual({ r: 216, g: 144, b: 31, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.075)")).toEqual({ r: 0, g: 0, b: 0, a: 0.075 });
    expect(parseColor("rgb(94 74 227 / 50%)")).toEqual({ r: 94, g: 74, b: 227, a: 0.5 });
    expect(parseColor("color(srgb 1 0.5 0)")).toEqual({ r: 255, g: 127.5, b: 0, a: 1 });
    expect(parseColor("oklab(0.5 0.1 0.1)")).toBeNull();
  });

  it("computes WCAG luminance and contrast", () => {
    expect(relativeLuminance(white)).toBeCloseTo(1, 9);
    expect(relativeLuminance(black)).toBe(0);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 9);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 9);
  });

  it("picks the cluster text token with the higher contrast", () => {
    const amber = { r: 216, g: 144, b: 31, a: 1 };
    const violet = { r: 94, g: 74, b: 227, a: 1 };
    expect(readableTextToken(amber, white, black)).toBe(MAP_COLOR_TOKENS.darkText);
    expect(readableTextToken(violet, white, black)).toBe(MAP_COLOR_TOKENS.lightText);
    expect(readableTextToken(null, white, black)).toBe(MAP_COLOR_TOKENS.lightText);
  });
});
