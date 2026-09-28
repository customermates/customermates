import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const tocSource = readFileSync(
  join(REPO_ROOT, "components", "shared", "toc.tsx"),
  "utf8",
);
const scrollportSource = readFileSync(
  join(REPO_ROOT, "app", "components", "navigation", "public-scrollport.tsx"),
  "utf8",
);
const layoutSource = readFileSync(join(REPO_ROOT, "app", "root-document.tsx"), "utf8");
const globalStyles = readFileSync(
  join(REPO_ROOT, "styles", "globals.css"),
  "utf8",
);
const styleguideSource = readFileSync(
  join(
    REPO_ROOT,
    "app",
    "[locale]",
    "(static)",
    "styleguide",
    "components",
    "styleguide-chapter.tsx",
  ),
  "utf8",
);

describe("shared table-of-contents scroll contract", () => {
  it("preserves the public rail and heading offsets", () => {
    expect(scrollportSource).toContain("[--table-sticky-top:4rem]");
    expect(scrollportSource).toContain("[--toc-sticky-top:4rem]");
    expect(scrollportSource).toContain("[--toc-anchor-offset:5rem]");
    expect(scrollportSource).toContain("xl:[--table-sticky-top:3.5rem]");
    expect(scrollportSource).toContain("xl:[--toc-sticky-top:3.5rem]");
    expect(scrollportSource).toContain("xl:[--toc-anchor-offset:4.5rem]");
    expect(styleguideSource).toContain("sticky top-16");
    expect(tocSource).toContain("top-[var(--toc-sticky-top,0px)]");
    expect(tocSource).toContain(
      "max-h-[calc(100svh-var(--toc-viewport-offset,0px)-var(--toc-sticky-top,0px))]",
    );
    expect(tocSource).toContain(
      "[&_[id]]:scroll-mt-[var(--toc-anchor-offset,0px)]",
    );
    expect(tocSource).toContain("self-start");
  });

  it("lets Next disable global smooth scrolling during route transitions", () => {
    expect(globalStyles).toContain('html[data-scroll-behavior="smooth"] [data-public-scrollport]');
    expect(layoutSource).toContain('data-scroll-behavior="smooth"');
    expect(scrollportSource).toContain("scrollportRef.current.scrollTop = 0");
  });

  it("lets Fumadocs manage active-item scrolling without a polling workaround", () => {
    expect(tocSource).toContain("<FumaToc.TOCScrollArea");
    expect(tocSource).toContain("<TocClerk.TOCItems />");
    expect(tocSource).not.toMatch(
      /\b(?:setInterval|clearInterval|useEffect|useRef|ScrollProvider)\b/u,
    );
    expect(tocSource).not.toMatch(/<main\b/u);
  });

  it("keeps zero-offset defaults for shells such as docs that do not set the public variables", () => {
    expect(tocSource.match(/var\(--toc-sticky-top,0px\)/gu)).toHaveLength(2);
    expect(tocSource).toContain("var(--toc-anchor-offset,0px)");
  });

  it("keeps the compact article rail opt-in while giving the default layout fixed columns", () => {
    expect(tocSource).toContain('layout?: "article" | "default"');
    expect(tocSource).toContain('layout = "default"');
    expect(tocSource).toContain(
      '"text-sm lg:grid lg:grid-cols-[minmax(0,96ch)_15rem] lg:justify-center lg:gap-6"',
    );
    expect(tocSource).toContain("lg:grid-cols-[minmax(0,96ch)_15rem]");
    expect(tocSource).toContain("lg:gap-6");
    expect(tocSource).toContain('layout === "article" && "lg:w-60"');
  });

  it("sizes the article column before the rail is parsed, so the page does not shift when it arrives", () => {
    // The rail follows the whole article in DOM order. With a content-sized flex rail, a paint
    // before the parser reached it laid the article out at full width, and the rail's arrival
    // rewrapped everything: a desktop CLS of about 0.19 on /en/docs/mcp in two of six lab runs.
    // Fixed grid tracks give the article its final width from the container alone.
    expect(tocSource).toContain('"lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6"');
    expect(tocSource).not.toMatch(/"flex gap-6"/u);
    expect(tocSource).not.toContain("max-w-68");
  });
});
