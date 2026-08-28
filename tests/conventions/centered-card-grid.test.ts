import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const gridPattern = readFileSync(join(REPO_ROOT, "components", "shared", "grid-pattern.tsx"), "utf8");
const centeredCardPage = readFileSync(
  join(REPO_ROOT, "components", "shared", "centered-card-page.tsx"),
  "utf8",
);
const onboardingSkeleton = readFileSync(
  join(
    REPO_ROOT,
    "app",
    "[locale]",
    "(protected)",
    "onboarding",
    "wizard",
    "components",
    "onboarding-page-skeleton.tsx",
  ),
  "utf8",
);
const homepageHero = readFileSync(
  join(REPO_ROOT, "app", "[locale]", "(static)", "components", "homepage-hero.tsx"),
  "utf8",
);

describe("centered-card grid background", () => {
  it("uses one token-derived line grid on centered-card pages and their loading state", () => {
    expect(gridPattern).toContain(
      "linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)",
    );
    expect(gridPattern).toContain("[background-size:56px_56px]");
    expect(gridPattern).toContain("radial-gradient(ellipse_82%_80%_at_50%_50%");
    expect(centeredCardPage).toContain("<GridPattern />");
    expect(centeredCardPage).not.toMatch(/DotPattern|radial-gradient\(circle at 1px 1px/u);
    expect(onboardingSkeleton).toContain("<GridPattern />");
  });

  it("shares the same grid primitive with the homepage opening", () => {
    expect(homepageHero).toContain("GridPattern");
    expect(homepageHero).toContain('fade="bottom"');
  });
});
