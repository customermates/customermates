import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NOINDEX_METADATA } from "../noindex-metadata";
import { NOINDEX_PUBLIC_ROUTES, isNoindexPublicRoute } from "@/i18n/routing";

describe("non-indexable account routes", () => {
  it("keeps every declared account route out of the index", () => {
    for (const route of NOINDEX_PUBLIC_ROUTES) expect(isNoindexPublicRoute(route), route).toBe(true);
  });

  it("disallows indexing and following on stateful account pages", () => {
    expect(NOINDEX_METADATA.robots).toEqual({
      follow: false,
      index: false,
      nocache: true,
    });
  });

  it.each([
    "app/[locale]/(public)/auth/error/page.tsx",
    "app/[locale]/(public)/auth/mcp-consent/page.tsx",
    "app/[locale]/(public)/auth/pending/page.tsx",
    "app/[locale]/(public)/auth/verify-email/page.tsx",
  ])("exports explicit noindex metadata from %s", (path) => {
    expect(readFileSync(join(process.cwd(), path), "utf8")).toContain("export const metadata = NOINDEX_METADATA");
  });
});
