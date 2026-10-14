import type { AcceptedPlugin } from "postcss";

import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, describe, expect, it } from "vitest";

const compiled: Record<string, string> = {};
beforeAll(async () => {
  // Compile the real layers with a small candidate set. This exercises vendor
  // imports and reference ordering without scanning the entire application.
  for (const name of ["public", "application"]) {
    const file = path.join(process.cwd(), "styles", `${name}.css`);
    const css =
      fs
        .readFileSync(file, "utf8")
        .replace(/@import "\.\/\.generated\/[^"]+";/g, "")
        .replace(/@source "[^"]+";/g, "") +
      '\n@source inline("prose dark:prose-invert animate-spin animate-bounce animate-in animate-out w-3xs hidden xl:flex");';
    // Tailwind and the app pin different compatible PostCSS 8 minor versions.
    compiled[name] = (
      await postcss([tailwind({ optimize: true }) as unknown as AcceptedPlugin]).process(css, { from: file })
    ).css;
  }
}, 60_000);

describe("route stylesheet behavior", () => {
  it("preserves inverse-aware typography after loading Fumadocs", () => {
    const selectors: string[] = [];
    postcss.parse(compiled.public).walkRules((rule) => {
      if (rule.selector.includes("dark\\:prose-invert")) selectors.push(rule.toString());
    });
    expect(selectors.join("\n")).toContain("data-marketing-tone");
  });

  it("keeps branded dark documentation colors authoritative", () => {
    const colors: Record<string, string> = {};
    for (const css of [compiled.public]) {
      postcss.parse(css).walkRules((rule) => {
        if (rule.selectors.includes(".dark"))
          rule.walkDecls((declaration) => {
            colors[declaration.prop] = declaration.value;
          });
      });
    }
    expect(colors["--color-fd-primary"]).toBe("#5e4ae3");
    expect(colors["--color-fd-background"]).toBe("#0e0e10");
  });

  it("keeps responsive navigation utilities after base visibility rules in the same cascade layer", () => {
    for (const css of [compiled.public, compiled.application]) {
      const visibility: { selector: string; layer: string | undefined }[] = [];
      postcss.parse(css).walkRules((rule) => {
        if (![".hidden", ".xl\\:flex"].includes(rule.selector)) return;
        let parent: postcss.Node["parent"] = rule.parent;
        while (parent && !(parent instanceof postcss.AtRule && parent.name === "layer")) parent = parent.parent;
        visibility.push({
          selector: rule.selector,
          layer: parent instanceof postcss.AtRule ? parent.params : undefined,
        });
      });
      expect(visibility).toEqual([
        { selector: ".hidden", layer: "utilities" },
        { selector: ".xl\\:flex", layer: "utilities" },
      ]);
    }
  });

  it("opens and closes overlays without animating a filter", () => {
    // WebKit's Skia compositor crashes on an accelerated filter animation that reaches `none`,
    // so styles/globals.css replaces tw-animate-css's enter/exit keyframes. The last rule wins.
    for (const css of [compiled.public, compiled.application]) {
      const effective = new Map<string, string[]>();
      postcss.parse(css).walkAtRules("keyframes", (rule) => {
        if (!["enter", "exit"].includes(rule.params)) return;
        const properties: string[] = [];
        rule.walkDecls((declaration) => {
          properties.push(declaration.prop);
        });
        effective.set(rule.params, properties);
      });
      expect(Object.fromEntries(effective)).toEqual({ enter: ["opacity", "transform"], exit: ["opacity", "transform"] });
    }
  });

  it("emits animation keyframes needed by application-only utilities", () => {
    expect(compiled.application).toContain("@keyframes spin");
    expect(compiled.application).toContain("@keyframes bounce");
    expect(compiled.application).toContain(".w-3xs");
  });
});
