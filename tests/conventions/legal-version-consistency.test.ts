import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";

import { REPO_ROOT } from "./walk";

function legal(locale: "en" | "de", slug: string): string {
  return readFileSync(
    join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`),
    "utf8",
  );
}

function versionHeader(locale: "en" | "de", slug: string): string {
  const header = legal(locale, slug).match(
    /^_Version (\d{4}-\d{2}-\d{2})(?:[^\n]*)_$/m,
  );
  expect(header, `${locale}/${slug} has no ISO version header`).not.toBeNull();
  return header![1];
}

describe("legal document versions", () => {
  it.each(["terms", "privacy", "dpa"] as const)(
    "keeps %s EN, DE, and the application constant equal",
    (slug) => {
      expect(versionHeader("en", slug)).toBe(LEGAL_DOCUMENT_VERSIONS[slug]);
      expect(versionHeader("de", slug)).toBe(LEGAL_DOCUMENT_VERSIONS[slug]);
    },
  );

  it("keeps the subprocessor update date aligned across languages", () => {
    expect(legal("en", "subprocessors")).toContain(
      "_Last updated: 7 August 2026_",
    );
    expect(legal("de", "subprocessors")).toContain("_Stand: 7. August 2026_");
  });
});
