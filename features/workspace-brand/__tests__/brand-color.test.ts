import { describe, expect, it } from "vitest";

import { brandForeground, brandLuminance, brandStyle, isBrandColor } from "../brand-color";
import { publicBrand } from "../workspace-brand.schema";

const LUMINANCE = { black: 0, white: 1 };

function contrast(color: string, foreground: "black" | "white"): number {
  const [lighter, darker] = [brandLuminance(color), LUMINANCE[foreground]].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("isBrandColor", () => {
  it.each(["#000000", "#ffffff", "#0f62fe", "#a1b2c3"])("accepts %s", (value) => {
    expect(isBrandColor(value)).toBe(true);
  });

  it.each(["#FFF", "#fff", "#0F62FE", "0f62fe", "#0f62fe ", "#0f62feaa", "red", "", null, undefined, 123])(
    "refuses %s",
    (value) => {
      expect(isBrandColor(value)).toBe(false);
    },
  );
});

describe("brandLuminance", () => {
  it("follows the WCAG relative luminance", () => {
    expect(brandLuminance("#000000")).toBe(0);
    expect(brandLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(brandLuminance("#ff0000")).toBeCloseTo(0.2126, 4);
    expect(brandLuminance("#00ff00")).toBeCloseTo(0.7152, 4);
    expect(brandLuminance("#0000ff")).toBeCloseTo(0.0722, 4);
    expect(brandLuminance("#808080")).toBeCloseTo(0.2159, 3);
  });
});

describe("brandForeground", () => {
  it("puts white on dark colours and black on light ones", () => {
    expect(brandForeground("#000000")).toBe("white");
    expect(brandForeground("#0a0a0b")).toBe("white");
    expect(brandForeground("#1d4ed8")).toBe("white");
    expect(brandForeground("#7c3aed")).toBe("white");
    expect(brandForeground("#ffffff")).toBe("black");
    expect(brandForeground("#fde047")).toBe("black");
    expect(brandForeground("#22c55e")).toBe("black");
  });

  it("always picks the side with the higher contrast, which is at least 4.5:1", () => {
    for (let value = 0; value <= 0xffffff; value += 0x010305) {
      const color = `#${value.toString(16).padStart(6, "0")}`;
      const chosen = brandForeground(color);
      const other = chosen === "black" ? "white" : "black";

      expect(contrast(color, chosen)).toBeGreaterThanOrEqual(contrast(color, other));
      expect(contrast(color, chosen)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("brandStyle", () => {
  it("overrides the primary colour pair of the app", () => {
    expect(brandStyle("#1d4ed8")).toEqual({ "--primary": "#1d4ed8", "--primary-foreground": "white" });
    expect(brandStyle("#fde047")).toEqual({ "--primary": "#fde047", "--primary-foreground": "black" });
  });

  it("changes nothing without a valid colour", () => {
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle(undefined)).toBeUndefined();
    expect(brandStyle("blue")).toBeUndefined();
    expect(brandStyle("#1D4ED8")).toBeUndefined();
  });
});

describe("publicBrand", () => {
  it("is null when nothing is set", () => {
    expect(publicBrand(null)).toBeNull();
    expect(publicBrand(undefined)).toBeNull();
    expect(publicBrand({ accentColor: null, logoKey: null })).toBeNull();
  });

  it("gives the logo its public address and drops a colour that is not a hex colour", () => {
    expect(publicBrand({ accentColor: "#1d4ed8", logoKey: "key_abcdefghijklmnop" })).toEqual({
      accentColor: "#1d4ed8",
      logoUrl: "/api/brand/logo/key_abcdefghijklmnop",
    });
    expect(publicBrand({ accentColor: "blue", logoKey: "key_abcdefghijklmnop" })).toEqual({
      accentColor: null,
      logoUrl: "/api/brand/logo/key_abcdefghijklmnop",
    });
    expect(publicBrand({ accentColor: "#1d4ed8", logoKey: null })).toEqual({ accentColor: "#1d4ed8", logoUrl: null });
  });
});
