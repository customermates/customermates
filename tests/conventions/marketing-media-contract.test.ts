import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const LEGACY_HERO_ROOTS = [
  "assets/hero-sources",
  "public/images/dark/de",
  "public/images/dark/en",
  "public/images/light/de",
  "public/images/light/en",
];

describe("marketing media contract", () => {
  it("keeps the retired static localized hero pipeline absent", () => {
    for (const path of LEGACY_HERO_ROOTS) expect(existsSync(join(REPO_ROOT, path)), path).toBe(false);
  });

  it("keeps shared theme images independent of content locale", () => {
    const appImage = readFileSync(join(REPO_ROOT, "components", "shared", "app-image.tsx"), "utf8");

    expect(appImage).not.toContain("isLocalized");
    expect(appImage).not.toContain("useLocale");
    expect(appImage).toContain("/images/${themePath}/${src as string}");
  });
});
