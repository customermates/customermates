import { describe, expect, it } from "vitest";

import {
  DEMO_DEFAULT_SOLUTION_ID,
  DEMO_DEFAULT_WORKSPACE_SLUG,
  SOLUTION_CATALOG,
  SOLUTION_DATA_LOCALES,
  demoDefaultWorkspaceSlug,
  findSolution,
  findSolutionByWorkspaceSlug,
  solutionDataLocaleForUiLocale,
} from "@/core/solutions/solution-catalog";
import {
  APP_LOCALES,
  CONTENT_LOCALES,
  DEFAULT_LOCALE,
  assetLocaleFor,
  isMarketingPathPublished,
} from "@/i18n/locale-registry";

describe("solution catalog", () => {
  it("keeps every workspace slug and company id unique", () => {
    const slugs = SOLUTION_CATALOG.flatMap((entry) => Object.values(entry.workspaceSlugs));
    const ids = SOLUTION_CATALOG.flatMap((entry) => Object.values(entry.companyIds));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slugs).toContain(DEMO_DEFAULT_WORKSPACE_SLUG);
  });

  it("enters the demo in the default solution's workspace of the interface's data locale", () => {
    expect(findSolution(DEMO_DEFAULT_SOLUTION_ID).workspaceSlugs[assetLocaleFor(DEFAULT_LOCALE)]).toBe(
      DEMO_DEFAULT_WORKSPACE_SLUG,
    );
    for (const uiLocale of APP_LOCALES) {
      expect(demoDefaultWorkspaceSlug(uiLocale)).toBe(
        findSolution(DEMO_DEFAULT_SOLUTION_ID).workspaceSlugs[solutionDataLocaleForUiLocale(uiLocale)],
      );
    }
  });

  it("derives the slug and company id tables from the per-data-locale workspaces", () => {
    for (const entry of SOLUTION_CATALOG) {
      for (const dataLocale of SOLUTION_DATA_LOCALES) {
        expect(entry.workspaceSlugs[dataLocale]).toBe(entry.workspaces[dataLocale].slug);
        expect(entry.companyIds[dataLocale]).toBe(entry.workspaces[dataLocale].companyId);
        expect(findSolutionByWorkspaceSlug(entry.workspaces[dataLocale].slug)).toEqual({ solution: entry, dataLocale });
      }
    }
  });

  it("publishes each solution in every full content locale and in partial locales that list its landing path", () => {
    for (const entry of SOLUTION_CATALOG) {
      for (const locale of CONTENT_LOCALES) expect(entry.publicLocales).toContain(locale);
      for (const locale of entry.publicLocales) expect(isMarketingPathPublished(locale, entry.landingPath)).toBe(true);
    }
  });

  it("uses the UI locale's own data when it ships content, otherwise the default data", () => {
    for (const locale of APP_LOCALES) expect(solutionDataLocaleForUiLocale(locale)).toBe(assetLocaleFor(locale));
    expect(solutionDataLocaleForUiLocale("xx")).toBe(DEFAULT_LOCALE);
  });

  it("names one menu preview highlight per solution: two dashboards, five lists and two inboxes", () => {
    const kinds = SOLUTION_CATALOG.map((entry) => entry.navPreview.kind);
    expect(kinds.filter((kind) => kind === "dashboard")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "view")).toHaveLength(5);
    expect(kinds.filter((kind) => kind === "record")).toHaveLength(0);
    expect(kinds.filter((kind) => kind === "inbox")).toHaveLength(2);
    for (const entry of SOLUTION_CATALOG) expect(entry.previewRoute).toBe("/dashboard");
  });
});
