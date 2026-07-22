import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

// Prevents one-language drift of the Unipile / connected-account disclosure (CUS-56):
// the required sections and cross-links must be present in BOTH locale variants.

const LOCALES = ["en", "de"] as const;

function legal(locale: string, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

describe("legal Unipile disclosure parity", () => {
  it.each(LOCALES)("privacy (%s) names Unipile and links the subprocessor list", (locale) => {
    const privacy = legal(locale, "privacy");
    expect(privacy, "privacy policy must name Unipile").toMatch(/Unipile/);
    expect(privacy, "privacy policy must link the subprocessor list").toMatch(/\/subprocessors/);
  });

  it.each(LOCALES)("terms (%s) disclose the Unipile / upstream-platform dependency", (locale) => {
    expect(legal(locale, "terms")).toMatch(/Unipile/);
  });

  it.each(LOCALES)("subprocessors (%s) list Unipile", (locale) => {
    expect(legal(locale, "subprocessors")).toMatch(/Unipile/);
  });

  it.each(LOCALES)("dpa (%s) references Art. 28 processing on behalf", (locale) => {
    expect(legal(locale, "dpa")).toMatch(/Art\.?\s?28|Article\s?28|Auftragsverarbeitung/);
  });
});
