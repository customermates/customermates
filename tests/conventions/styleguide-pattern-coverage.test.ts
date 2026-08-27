import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const STYLEGUIDE = join(
  REPO_ROOT,
  "app",
  "[locale]",
  "(static)",
  "styleguide",
  "components",
);

function read(file: string): string {
  return readFileSync(join(STYLEGUIDE, file), "utf8");
}

function indirectMediaImports(source: string) {
  return source.includes("@/components/marketing/cta-section") ? ["media-bearing CTASection"] : [];
}

describe("style guide pattern coverage", () => {
  const patterns = read("section-patterns.tsx");
  const contract = read("responsive-contract.tsx");
  const declared = [...patterns.matchAll(/id="(S-\d+)"/g)].map(
    (match) => match[1],
  );

  it("declares a pattern library worth documenting", () => {
    expect([...new Set(declared)]).toEqual([
      "S-01",
      "S-02",
      "S-03",
      "S-04",
      "S-05",
      "S-06",
      "S-07",
      "S-08",
      "S-09",
      "S-10",
      "S-11",
    ]);
  });

  it("uses neutral media slots instead of marketing imagery", () => {
    expect(patterns).toContain("function PatternMediaSlot");
    expect(patterns).toContain("Neutral media slot");
    expect(patterns).toContain('["Aspect", aspect]');
    expect(patterns).toContain('["Role", placementRole]');
    expect(patterns).toContain('["Crop", crop]');
    expect(patterns).toContain('["Collapse", collapse]');
    expect(patterns).not.toMatch(
      /from\s+["'][^"']*\/(?:scenes|schematics)(?:\/|["'])/u,
    );
    expect(patterns).not.toMatch(/\bApp(?:Image|Video)\b/u);
    expect(patterns).not.toMatch(
      /\.(?:avif|gif|jpe?g|mp4|png|svg|webm|webp)["']/iu,
    );
    expect(indirectMediaImports('import { CTASection } from "@/components/marketing/cta-section";')).toEqual([
      "media-bearing CTASection",
    ]);
    expect(indirectMediaImports(patterns)).toEqual([]);
  });

  it("gives every declared pattern a row in the collapse table", () => {
    const covered = new Set(
      [...contract.matchAll(/(S-\d+)/g)].map((match) => match[1]),
    );
    const missing = [...new Set(declared)]
      .filter((id) => !covered.has(id))
      .sort();

    expect(
      missing,
      `the style guide states that a pattern with no collapse entry is unchecked, so every pattern in section-patterns.tsx must appear in responsive-contract.tsx`,
    ).toEqual([]);
  });

  it("does not document a collapse rule for a pattern that no longer exists", () => {
    const declaredSet = new Set(declared);
    const covered = [
      ...new Set([...contract.matchAll(/(S-\d+)/g)].map((match) => match[1])),
    ];
    const orphans = covered.filter((id) => !declaredSet.has(id)).sort();

    expect(
      orphans,
      `responsive-contract.tsx documents a pattern that section-patterns.tsx no longer renders`,
    ).toEqual([]);
  });
});
