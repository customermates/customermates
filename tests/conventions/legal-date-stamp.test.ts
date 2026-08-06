import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { formatDate, stampDocument } from "@/scripts/stamp-legal-date";

const LOCALES = ["en", "de"] as const;
const DOCUMENTS = ["privacy", "terms", "dpa", "subprocessors"] as const;

function legal(locale: string, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

describe("formatDate", () => {
  it("renders the German and English long forms", () => {
    const formats = formatDate("2026-08-20");

    expect(formats.longEn).toBe("20 August 2026");
    expect(formats.longDe).toBe("20. August 2026");
    expect(formats.numeric).toBe("20.08.2026");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => formatDate("20.08.2026")).toThrow();
    expect(() => formatDate("2026-02-30")).toThrow();
  });
});

describe("stampDocument", () => {
  const formats = formatDate("2026-08-20");

  it.each(LOCALES)("rewrites every date line in the %s documents", (locale) => {
    for (const document of DOCUMENTS) {
      const source = legal(locale, document);
      const stamped = stampDocument(source, locale, formats);
      const long = locale === "en" ? formats.longEn : formats.longDe;

      for (const line of stamped.split("\n")) {
        if (!/^[_*](Version|Last updated|Stand|Last Update)/.test(line)) continue;

        const carriesNewDate = line.includes(long) || line.includes(formats.numeric) || line.includes(formats.iso);
        expect(carriesNewDate, `${locale}/${document} left a stale date line: ${line}`).toBe(true);
      }
    }
  });

  it("leaves the body text untouched", () => {
    const source = legal("en", "terms");
    const stamped = stampDocument(source, "en", formats);

    expect(stamped.split("\n").length).toBe(source.split("\n").length);
    expect(stamped).toContain("## 1. Scope and Subject Matter of Contract");
  });

  it.each(LOCALES)("does not backdate DPA effectiveness for %s", (locale) => {
    const stamped = stampDocument(legal(locale, "dpa"), locale, formats);

    expect(stamped).toContain(locale === "en" ? "when concluded under Section 2" : "bei Abschluss nach Ziffer 2");
    expect(stamped).not.toContain(locale === "en" ? `effective ${formats.longEn}` : `gültig ab ${formats.longDe}`);
  });
});

describe("published legal documents carry a date on every document", () => {
  it.each(LOCALES)("%s documents each declare a version or effective date", (locale) => {
    for (const document of DOCUMENTS) {
      const source = legal(locale, document);

      expect(
        /^[_*](Version|Last updated|Stand|Last Update)/m.test(source),
        `${locale}/${document} has no date line`,
      ).toBe(true);
    }
  });
});
