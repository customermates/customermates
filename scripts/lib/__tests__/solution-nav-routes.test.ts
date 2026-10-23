import { describe, expect, it } from "vitest";

import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES } from "@/core/solutions/solution-catalog";

import { NAV_PREVIEW_FALLBACK_PATH, solutionNavPreview, solutionNavPreviewPath } from "../solution-nav-routes";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const PATTERNS = {
  configure: /^\/configure$/u,
  dashboard: /^\/dashboard$/u,
  inbox: new RegExp(`^/inbox\\?threadId=${UUID}$`, "u"),
  record: new RegExp(`^/records/${UUID}/${UUID}$`, "u"),
  view: new RegExp(`^/records/${UUID}\\?view=${UUID}$`, "u"),
} as const;

describe("solution navigation preview routes", () => {
  it("resolves every solution's highlight from its seed definition, or falls back to the dashboard with a reason", () => {
    for (const solution of SOLUTION_CATALOG) {
      for (const dataLocale of SOLUTION_DATA_LOCALES) {
        const resolved = solutionNavPreviewPath(solution, dataLocale);
        if (resolved.fallback) expect(resolved.path).toBe(NAV_PREVIEW_FALLBACK_PATH);
        else expect(resolved.path, `${solution.id}/${dataLocale}`).toMatch(PATTERNS[solution.navPreview.kind]);
        expect(solutionNavPreviewPath(solution, dataLocale)).toEqual(resolved);
      }
    }
  });

  it("opens the highlight in the workspace of the UI locale's data", () => {
    for (const solution of SOLUTION_CATALOG) {
      for (const locale of solution.publicLocales) {
        const { path } = solutionNavPreview(solution, locale);
        expect(path.startsWith(`/${locale}/w/`)).toBe(true);
      }
    }
  });

  it("resolves different ids for the English and German workspaces of a record highlight", () => {
    const solution = SOLUTION_CATALOG.find((entry) => entry.navPreview.kind !== "dashboard");
    if (!solution) return;
    const [first, second] = SOLUTION_DATA_LOCALES.map((locale) => solutionNavPreviewPath(solution, locale));
    if (first.fallback || second.fallback) return;
    expect(first.path).not.toBe(second.path);
  });
});
