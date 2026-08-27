import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DOC_NAV_GROUPS } from "@/features/docs/docs-nav";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const registeredSlugs = DOC_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.slug));
const LANDING_SLUGS_NOT_IN_SIDEBAR = ["intro-page"];
const NAV_ROUTES_WITHOUT_MDX = ["", "openapi"];

describe("docs navigation completeness", () => {
  it("registers every docs page in the navigation", () => {
    const slugs = readdirSync(join(REPO_ROOT, "content", "docs", "en"))
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => file.replace(/\.mdx$/, ""));
    const orphans = slugs.filter(
      (slug) => !registeredSlugs.includes(slug) && !LANDING_SLUGS_NOT_IN_SIDEBAR.includes(slug),
    );
    expect(orphans, "pages exist but are missing from DOC_NAV_GROUPS, so the sidebar and llms.txt never show them").toEqual(
      [],
    );
  });

  it("has a page in every locale for every registered slug", () => {
    const missing: string[] = [];
    for (const locale of CONTENT_LOCALES)
      for (const slug of registeredSlugs.filter((entry) => !NAV_ROUTES_WITHOUT_MDX.includes(entry))) {
        try {
          readFileSync(join(REPO_ROOT, "content", "docs", locale, `${slug}.mdx`));
        } catch {
          missing.push(`${locale}/${slug}`);
        }
      }
    expect(missing).toEqual([]);
  });

  it("labels every registered slug in every app locale", () => {
    const locales = readdirSync(join(REPO_ROOT, "i18n", "locales")).filter((file) => file.endsWith(".json"));
    const missing: string[] = [];
    for (const file of locales) {
      const sidebar = (JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", file), "utf8")) as {
        DocsSidebar?: Record<string, string>;
      }).DocsSidebar;
      for (const group of DOC_NAV_GROUPS)
        for (const item of group.items) {
          const key = item.i18nKey.replace("DocsSidebar.", "");
          if (!sidebar?.[key]) missing.push(`${file}: ${key}`);
        }
    }
    expect(missing).toEqual([]);
  });
});
