import { describe, expect, it } from "vitest";

import { ChartColor } from "@/features/widget/widget-display.schema";

import {
  extractBrandColors,
  mapBrandColors,
  nearestChartColor,
  nearestChipColor,
  parseCssColor,
  toOklab,
} from "../brand-colors";

describe("brand colour extraction", () => {
  it.each([
    ["#0a66c2", { r: 10, g: 102, b: 194 }],
    ["#0AF", { r: 0, g: 170, b: 255 }],
    ["rgb(255, 0, 0)", { r: 255, g: 0, b: 0 }],
    ["rgb(100% 0% 0%)", { r: 255, g: 0, b: 0 }],
    ["rgba(0, 128, 0, 1)", { r: 0, g: 128, b: 0 }],
    ["hsl(120, 100%, 25%)", { r: 0, g: 127.5, b: 0 }],
  ])("parses %s", (value, expected) => {
    expect(parseCssColor(value)).toEqual(expected);
  });

  it.each(["transparent", "#12", "rgba(0, 0, 0, 0.1)", "#0a66c210", "rgb(300, 0, 0)", "var(--primary)"])(
    "ignores %s",
    (value) => {
      expect(parseCssColor(value)).toBeNull();
    },
  );

  it("converts white and black to OKLab lightness extremes", () => {
    expect(toOklab({ r: 255, g: 255, b: 255 }).l).toBeCloseTo(1, 3);
    expect(toOklab({ r: 0, g: 0, b: 0 }).l).toBeCloseTo(0, 3);
  });

  it("ranks the theme colour above custom properties and buttons", () => {
    const html = `
      <html><head>
        <meta content="#e4572e" name="theme-color">
        <style>
          :root { --brand-primary: #1d4ed8; --text: #111111; --surface: #ffffff; }
          .btn-primary { background-color: #1d4ed8; color: #fff; }
          footer { background: #16a34a; }
        </style>
      </head><body></body></html>`;
    const candidates = extractBrandColors({ html });
    expect(candidates.map((candidate) => candidate.hex)).toEqual(["#1d4ed8", "#e4572e"]);
    expect(candidates[0]).toEqual({ hex: "#1d4ed8", source: "customProperty", score: 5 });
    expect(candidates[1]).toEqual({ hex: "#e4572e", source: "themeColor", score: 5 });
  });

  it("reads the manifest and linked stylesheets", () => {
    const candidates = extractBrandColors({
      html: "<html><body><button>Buy</button></body></html>",
      manifest: JSON.stringify({ theme_color: "#7c3aed", background_color: "#ffffff" }),
      stylesheets: ["button, .cta { background: rgb(124, 58, 237) } .card { background: #f4f4f5 }"],
    });
    expect(candidates).toEqual([{ hex: "#7c3aed", source: "manifest", score: 6 }]);
  });

  it("returns nothing for a site without chromatic colours or with a broken manifest", () => {
    const html = "<style>body{background:#fff;color:#222} .btn{background:#e5e5e5}</style>";
    expect(extractBrandColors({ html, manifest: "{not json" })).toEqual([]);
    expect(mapBrandColors({ html })).toBeNull();
  });

  it.each([
    ["#ff3b30", "destructive", ChartColor.danger1],
    ["#34c759", "success", ChartColor.success1],
    ["#ff9500", "warning", ChartColor.warning1],
    ["#5e4ae3", "default", ChartColor.primary1],
    ["#0a84ff", "info", ChartColor.primary2],
  ])("maps %s to the nearest chip and chart colour", (hex, chip, chart) => {
    expect(nearestChipColor(hex)).toBe(chip);
    expect(nearestChartColor(hex)).toBe(chart);
  });

  it("maps the strongest candidate", () => {
    expect(
      mapBrandColors({ html: '<meta name="theme-color" content="#16a34a"><style>.btn{background:#16a34a}</style>' }),
    ).toEqual({ hex: "#16a34a", chip: "success", chart: nearestChartColor("#16a34a") });
  });
});
