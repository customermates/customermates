import { describe, expect, it } from "vitest";

import {
  type SolutionCaptureEntry,
  type SolutionCaptureManifest,
  type SolutionCaptureProvenance,
  SOLUTION_CAPTURE_THEMES,
  SOLUTION_CAPTURE_VIEWPORT,
  SOLUTION_NAV_CAPTURE_CLIP,
  SOLUTION_NAV_CAPTURE_VIEWPORT,
  checkSolutionCaptureManifest,
  solutionCapturePair,
  solutionCapturePlan,
  solutionCaptureRoute,
} from "@/core/solutions/solution-captures";
import { SOLUTION_CATALOG, findSolution, solutionDataLocaleForUiLocale } from "@/core/solutions/solution-catalog";
import { APP_LOCALES } from "@/i18n/locale-registry";

const smb = findSolution("smb");
const catalog = [smb];

function capturedManifest(): { manifest: SolutionCaptureManifest; provenance: SolutionCaptureProvenance } {
  const plan = solutionCapturePlan(catalog);
  const entries: SolutionCaptureEntry[] = plan.map((item) => ({
    locale: item.locale,
    main: { bytes: 10, height: 1800, src: item.mainSrc, width: 2880 },
    nav: { bytes: 5, height: 600, src: item.navSrc, width: 960 },
    placeholder: false,
    solution: item.solution.id,
    theme: item.theme,
  }));
  return {
    manifest: { entries },
    provenance: {
      capturedOn: "2026-10-22",
      entries: plan.map((item) => ({
        key: item.key,
        mainSha256: "m",
        navRoute: `${item.route}#nav`,
        navSha256: "n",
        route: item.route,
      })),
      environment: "test",
      sourceRevision: "abc",
      viewport: SOLUTION_CAPTURE_VIEWPORT,
    },
  };
}

function facts(src: string) {
  return src.endsWith("-nav.webp") ? { bytes: 5, sha256: "n" } : { bytes: 10, sha256: "m" };
}

describe("solution capture plan", () => {
  it("covers every solution in each of its public locales and both themes", () => {
    const plan = solutionCapturePlan();
    const expected = SOLUTION_CATALOG.reduce((sum, entry) => sum + entry.publicLocales.length, 0);
    expect(plan).toHaveLength(expected * SOLUTION_CAPTURE_THEMES.length);
    expect(new Set(plan.map((item) => item.key)).size).toBe(plan.length);
  });

  it("opens the solution workspace whose data locale follows the UI locale", () => {
    for (const locale of APP_LOCALES) {
      const slug = smb.workspaces[solutionDataLocaleForUiLocale(locale)].slug;
      expect(solutionCaptureRoute(smb, locale)).toBe(`/${locale}/w/${slug}${smb.previewRoute}`);
    }
  });

  it("keeps the navigation preview at 16:10 from the top-left of a 1280 px wide window", () => {
    expect(SOLUTION_NAV_CAPTURE_CLIP.width / SOLUTION_NAV_CAPTURE_CLIP.height).toBe(16 / 10);
    expect(SOLUTION_NAV_CAPTURE_CLIP.width).toBeLessThanOrEqual(SOLUTION_NAV_CAPTURE_VIEWPORT.width);
    expect(SOLUTION_NAV_CAPTURE_CLIP.height).toBeLessThanOrEqual(SOLUTION_NAV_CAPTURE_VIEWPORT.height);
  });
});

describe("solution capture check", () => {
  it("accepts a complete captured manifest", () => {
    const { manifest, provenance } = capturedManifest();
    const result = checkSolutionCaptureManifest(manifest, provenance, {
      allowPlaceholders: false,
      catalog,
      readFile: facts,
    });
    expect(result.problems).toEqual([]);
    expect(result.totalBytes).toBe(15 * manifest.entries.length);
  });

  it("fails on a missing view, a missing file, a hash drift and the budget", () => {
    const { manifest, provenance } = capturedManifest();
    const [first, ...rest] = manifest.entries;
    const result = checkSolutionCaptureManifest({ entries: rest }, provenance, {
      allowPlaceholders: false,
      budgetBytes: 1,
      catalog,
      readFile: (src) =>
        src === rest[0].main.src ? null : src === rest[1].nav.src ? { bytes: 5, sha256: "x" } : facts(src),
    });
    expect(result.problems).toEqual(
      expect.arrayContaining([
        `${first.solution}:${first.locale}:${first.theme}: missing capture`,
        expect.stringContaining("missing file"),
        expect.stringContaining("sha256 differs"),
        expect.stringContaining("budget"),
      ]),
    );
  });

  it("accepts flagged placeholders only when allowed and never another solution's view", () => {
    const { manifest, provenance } = capturedManifest();
    const placeholders = { entries: manifest.entries.map((entry) => ({ ...entry, placeholder: true })) };
    const allowed = checkSolutionCaptureManifest(placeholders, provenance, {
      allowPlaceholders: true,
      catalog,
      readFile: facts,
    });
    expect(allowed.problems).toEqual([]);
    expect(allowed.placeholders).toHaveLength(manifest.entries.length);
    expect(allowed.totalBytes).toBe(0);

    const strict = checkSolutionCaptureManifest(placeholders, provenance, {
      allowPlaceholders: false,
      catalog,
      readFile: facts,
    });
    expect(strict.problems.every((problem) => problem.endsWith("still a placeholder capture"))).toBe(true);

    const foreign = checkSolutionCaptureManifest(
      { entries: [...manifest.entries, { ...manifest.entries[0], solution: "agencies" }] },
      provenance,
      { allowPlaceholders: false, catalog, readFile: facts },
    );
    expect(foreign.problems).toContainEqual(expect.stringContaining("not a published solution view"));
  });

  it("checks the navigation preview route when a resolver is given", () => {
    const { manifest, provenance } = capturedManifest();
    const navRoute = (item: { route: string }) => `${item.route}#nav`;
    expect(
      checkSolutionCaptureManifest(manifest, provenance, {
        allowPlaceholders: false,
        catalog,
        navRoute,
        readFile: facts,
      }).problems,
    ).toEqual([]);

    const drifted = checkSolutionCaptureManifest(manifest, provenance, {
      allowPlaceholders: false,
      catalog,
      navRoute: (item) => `${item.route}#other`,
      readFile: facts,
    });
    expect(drifted.problems).toHaveLength(manifest.entries.length);
    expect(drifted.problems[0]).toContain("navigation preview captured");
  });

  it("pairs light and dark entries for one view", () => {
    const { manifest } = capturedManifest();
    const pair = solutionCapturePair(manifest, "smb", "en");
    expect(pair?.light.theme).toBe("light");
    expect(pair?.dark.theme).toBe("dark");
    expect(solutionCapturePair(manifest, "agencies", "en")).toBeNull();
  });
});
