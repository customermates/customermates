import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

/**
 * Following a docs url#anchor must leave the heading below the sticky docs header. Two things
 * guard that, and the repo has no layout engine in tests, so these are source-level tripwires:
 * the docs scroll container is the containing block for its absolutely positioned content (so
 * the outer shell never scrolls and slides the page under the header), and it sets the anchor
 * offset the Toc turns into each heading's scroll margin.
 */
const DOCS_PAGES = [
  "app/[locale]/(static)/docs/page.tsx",
  "app/[locale]/(static)/docs/[slug]/page.tsx",
  "app/[locale]/(static)/docs/openapi/page.tsx",
  "app/[locale]/(static)/docs/openapi/[slug]/page.tsx",
];

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function pageContainerClasses(source: string): string[] {
  return [...source.matchAll(/<PageContainer(?:\s+className="([^"]*)")?/g)].map((match) => match[1] ?? "");
}

describe("docs anchor scrolling", () => {
  it.each(DOCS_PAGES)("makes the scroll container the containing block in %s", (path) => {
    const classes = pageContainerClasses(read(path));

    expect(classes.length).toBeGreaterThan(0);
    for (const className of classes) expect(className.split(/\s+/)).toContain("relative");
  });

  it.each(DOCS_PAGES.filter((path) => read(path).includes("<Toc")))(
    "gives the Toc headings an anchor offset in %s",
    (path) => {
      for (const className of pageContainerClasses(read(path))) expect(className).toMatch(/\[--toc-anchor-offset:\S+\]/);
    },
  );
});
