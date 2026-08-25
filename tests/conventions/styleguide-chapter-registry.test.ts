import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { STYLEGUIDE_CHAPTERS } from "@/app/[locale]/(static)/styleguide/components/styleguide-chapters";
import { PUBLIC_ROUTES } from "@/i18n/routing";

import { REPO_ROOT } from "./walk";

const STYLEGUIDE_ROOT = join(
  REPO_ROOT,
  "app",
  "[locale]",
  "(static)",
  "styleguide",
);
const CHAPTER_ANCHOR_SOURCES = {
  foundations: [join(STYLEGUIDE_ROOT, "foundations", "page.tsx")],
  motion: [
    join(STYLEGUIDE_ROOT, "components", "motion-storyboards.tsx"),
    join(STYLEGUIDE_ROOT, "components", "motion-storyboards.data.ts"),
  ],
  overview: [join(STYLEGUIDE_ROOT, "page.tsx")],
  patterns: [join(STYLEGUIDE_ROOT, "components", "section-patterns.tsx")],
  visuals: [join(STYLEGUIDE_ROOT, "components", "visuals-chapter.tsx")],
} as const;

function routeFile(href: string): string {
  const suffix = href.slice("/styleguide".length);
  return join(STYLEGUIDE_ROOT, suffix, "page.tsx");
}

describe("style guide chapter registry", () => {
  it("authors the five chapters in their intended order", () => {
    expect(STYLEGUIDE_CHAPTERS.map((chapter) => chapter.id)).toEqual([
      "overview",
      "foundations",
      "patterns",
      "visuals",
      "motion",
    ]);
  });

  it("maps every chapter to one public route", () => {
    const hrefs = STYLEGUIDE_CHAPTERS.map((chapter) => chapter.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(
      hrefs.every((href) =>
        PUBLIC_ROUTES.includes(href as (typeof PUBLIC_ROUTES)[number]),
      ),
    ).toBe(true);
    expect(hrefs.every((href) => existsSync(routeFile(href)))).toBe(true);
  });

  it("authors unique subsection anchors without inspecting rendered headings", () => {
    for (const chapter of STYLEGUIDE_CHAPTERS) {
      const ids = chapter.sections.map((section) => section.id);
      expect(
        new Set(ids).size,
        `${chapter.id} repeats a subsection anchor`,
      ).toBe(ids.length);
    }

    const shell = readFileSync(
      join(STYLEGUIDE_ROOT, "components", "styleguide-chapter.tsx"),
      "utf8",
    );
    expect(shell).toContain("chapter.sections.map");
    expect(shell).toContain("[&_[id]]:scroll-mt-32");
    expect(shell).not.toMatch(
      /querySelector|usePathname|matchAll\([^)]*h[1-6]/u,
    );
  });

  it("resolves every subsection navigation entry to one authored anchor", () => {
    for (const chapter of STYLEGUIDE_CHAPTERS) {
      const source = CHAPTER_ANCHOR_SOURCES[chapter.id]
        .map((file) => readFileSync(file, "utf8"))
        .join("\n");

      for (const section of chapter.sections) {
        const escapedId = section.id.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const matches =
          source.match(
            new RegExp(
              `(?:id="${escapedId}"|id:\\s*"${escapedId}",)`,
              "gu",
            ),
          ) ?? [];

        expect(
          matches.length,
          `${chapter.id}#${section.id} must resolve exactly once`,
        ).toBe(1);
      }
    }
  });

  it("applies noindex metadata to every chapter through the style guide layout", () => {
    const layout = readFileSync(join(STYLEGUIDE_ROOT, "layout.tsx"), "utf8");

    expect(layout).toContain("index: false");
    expect(layout).toContain("follow: false");
  });
});
