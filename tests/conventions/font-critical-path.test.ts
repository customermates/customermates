import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const FONTS = readFileSync(join(REPO_ROOT, "app", "fonts.ts"), "utf8");
const GLOBALS = readFileSync(join(REPO_ROOT, "styles", "globals.css"), "utf8");
const ROOT_LAYOUT = readFileSync(join(REPO_ROOT, "app", "layout.tsx"), "utf8");

const declaredFamilies = [...FONTS.matchAll(/export const ([a-z]+) = localFont\(\{([\s\S]*?)\n\}\);/gu)].map(
  ([, name, body]) => ({ name, body, variable: /variable:\s*"(--font-[a-z-]+)"/u.exec(body)?.[1] }),
);

describe("font critical path", () => {
  it("finds every family declared in app/fonts.ts", () => {
    expect(declaredFamilies.length).toBeGreaterThan(0);
    for (const family of declaredFamilies) expect(family.variable, `${family.name} declares no CSS variable`).toBeTruthy();
  });

  it("loads no family that no stylesheet token references", () => {
    // next/font emits a rel=preload for every family whose .variable reaches <html>, whether or not
    // a CSS rule ever selects it. Lora shipped two preloaded faces on every page for months while
    // `font-serif` appeared nowhere outside its own declaration and styles/globals.css declared no
    // serif token at all: 76.7 KB of critical path per request, for a font that could never render.
    for (const { name, variable } of declaredFamilies) {
      expect(
        GLOBALS.includes(`var(${variable})`),
        `${name} is downloaded but no token in styles/globals.css references ${variable}; delete the family or add the token`,
      ).toBe(true);
    }
  });

  it("preloads only the family that paints body text", () => {
    // Every family without preload:false competes with the document and the render-blocking
    // stylesheet for the same connection before the largest text element can reach its final paint.
    for (const { name, body } of declaredFamilies) {
      if (name === "latin") {
        expect(body, "the body font must stay preloaded").not.toContain("preload: false");
        continue;
      }
      expect(
        body,
        `${name} preloads on every page; add preload: false unless it paints above the fold on every route`,
      ).toContain("preload: false");
    }
  });

  it("applies every declared family to the document", () => {
    for (const { name } of declaredFamilies) {
      expect(ROOT_LAYOUT, `${name} is declared in app/fonts.ts but never reaches <html>`).toContain(`${name}.variable`);
    }
  });
});
