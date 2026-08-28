import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const tocSource = readFileSync(join(REPO_ROOT, "components", "shared", "toc.tsx"), "utf8");
const navigationSource = readFileSync(
  join(REPO_ROOT, "app", "components", "navigation", "navigation-switch.tsx"),
  "utf8",
);

describe("shared table-of-contents scroll contract", () => {
  it("offsets the public rail and heading anchors below the sticky navbar", () => {
    expect(navigationSource).toContain("[--toc-sticky-top:4rem]");
    expect(navigationSource).toContain("[--toc-anchor-offset:5rem]");
    expect(tocSource).toContain("top-[var(--toc-sticky-top,0px)]");
    expect(tocSource).toContain("max-h-[calc(100svh-var(--toc-sticky-top,0px))]");
    expect(tocSource).toContain("[&_[id]]:scroll-mt-[var(--toc-anchor-offset,0px)]");
    expect(tocSource).toContain("self-start");
  });

  it("lets Fumadocs manage active-item scrolling without a polling workaround", () => {
    expect(tocSource).toContain("<FumaToc.TOCScrollArea");
    expect(tocSource).toContain("<TocClerk.TOCItems />");
    expect(tocSource).not.toMatch(/\b(?:setInterval|clearInterval|useEffect|useRef|ScrollProvider)\b/u);
    expect(tocSource).not.toMatch(/<main\b/u);
  });

  it("keeps zero-offset defaults for shells such as docs that do not set the public variables", () => {
    expect(tocSource.match(/var\(--toc-sticky-top,0px\)/gu)).toHaveLength(2);
    expect(tocSource).toContain("var(--toc-anchor-offset,0px)");
  });

  it("keeps the compact article rail opt-in while preserving the default flex layout", () => {
    expect(tocSource).toContain('layout?: "article" | "default"');
    expect(tocSource).toContain('layout = "default"');
    expect(tocSource).toContain(
      '"text-sm lg:grid lg:grid-cols-[minmax(0,80ch)_14rem] lg:justify-center lg:gap-8"',
    );
    expect(tocSource).toContain("lg:grid-cols-[minmax(0,80ch)_14rem]");
    expect(tocSource).toContain("lg:gap-8");
    expect(tocSource).toContain('layout === "article" ? "lg:w-56" : "max-w-68"');
    expect(tocSource).toContain('layout === "default" && "flex-1"');
  });
});
