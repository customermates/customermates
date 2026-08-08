import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";
import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const SUBPROCESSOR_VERSION_HEADER = {
  de: /^_Stand: (\d{4}-\d{2}-\d{2})_$/m,
  en: /^_Last updated: (\d{4}-\d{2}-\d{2})_$/m,
} satisfies Record<ContentLocale, RegExp>;

function legal(locale: ContentLocale, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

function versionHeader(locale: ContentLocale, slug: string): string {
  const content = legal(locale, slug);
  const header =
    slug === "subprocessors"
      ? content.match(SUBPROCESSOR_VERSION_HEADER[locale])
      : content.match(/^_Version (\d{4}-\d{2}-\d{2})(?:[^\n]*)_$/m);
  expect(header, `${locale}/${slug} has no ISO version header`).not.toBeNull();
  return header![1];
}

describe("legal document versions", () => {
  it.each(["terms", "privacy", "dpa", "subprocessors"] as const)(
    "keeps %s content locales and the application constant equal",
    (slug) => {
      for (const locale of CONTENT_LOCALES) {
        expect(versionHeader(locale, slug)).toBe(LEGAL_DOCUMENT_VERSIONS[slug]);
      }
    },
  );
});
