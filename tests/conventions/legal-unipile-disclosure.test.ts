import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { LEGAL_DOCUMENT_VERSIONS } from "@/constants/legal-documents";

// Guards the connected-account disclosure (CUS-56) against one-language drift and
// against describing processing the product does not perform.

const LOCALES = ["en", "de"] as const;

const ACCEPTANCE_MESSAGE_KEYS = ["OnboardingForm", "SignUpForm", "SignInForm"] as const;

const REMOVED_SUBJECTS = ["newsletter", "zoom", "google ads", "supabase", "flagcdn"];

function legal(locale: string, slug: string): string {
  return readFileSync(join(REPO_ROOT, "content", "legal", locale, `${slug}.mdx`), "utf8");
}

function locale(name: string): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${name}.json`), "utf8"));
}

function richTags(message: string): string[] {
  return [...message.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)>/g)].map((match) => match[1]).sort();
}

describe("legal Unipile disclosure parity", () => {
  it.each(LOCALES)("privacy (%s) names Unipile and links the subprocessor list", (name) => {
    const privacy = legal(name, "privacy");

    expect(privacy).toMatch(/Unipile/);
    expect(privacy).toMatch(/\/subprocessors/);
  });

  it.each(LOCALES)("terms (%s) disclose the Unipile dependency and incorporate the DPA", (name) => {
    const terms = legal(name, "terms");

    expect(terms).toMatch(/Unipile/);
    expect(terms).toMatch(/\/dpa/);
  });

  it.each(LOCALES)("subprocessors (%s) list Unipile and the database processor", (name) => {
    const subprocessors = legal(name, "subprocessors");

    expect(subprocessors).toMatch(/Unipile/);
    expect(subprocessors).toMatch(/Neon/);
  });

  it.each(LOCALES)("dpa (%s) references Art. 28 processing on behalf", (name) => {
    expect(legal(name, "dpa")).toMatch(/Art\.?\s?28|Article\s?28|Auftragsverarbeitung/);
  });
});

describe("legal documents describe only what the product does", () => {
  it.each(LOCALES)("privacy and subprocessors (%s) drop retired subjects", (name) => {
    const text = `${legal(name, "privacy")}\n${legal(name, "subprocessors")}`.toLowerCase();
    const present = REMOVED_SUBJECTS.filter((subject) => text.includes(subject));

    expect(present, `retired subjects still disclosed: ${present.join(", ")}`).toEqual([]);
  });

  it.each(LOCALES)("privacy (%s) does not claim a consent mechanism the product lacks", (name) => {
    expect(legal(name, "privacy")).not.toMatch(/flagcdn|Google Ads/i);
  });
});

describe("legal document versions stay coupled to the acceptance record", () => {
  it.each(LOCALES)("privacy, terms and dpa (%s) carry their version", (name) => {
    expect(legal(name, "privacy")).toContain(LEGAL_DOCUMENT_VERSIONS.privacy);
    expect(legal(name, "terms")).toContain(LEGAL_DOCUMENT_VERSIONS.terms);
    expect(legal(name, "dpa")).toContain(LEGAL_DOCUMENT_VERSIONS.dpa);
  });
});

describe("registration acceptance covers the DPA", () => {
  it.each(LOCALES)("acceptance messages (%s) link the DPA", (name) => {
    const messages = locale(name);

    for (const key of ACCEPTANCE_MESSAGE_KEYS)
      expect(messages[key].agreeToTerms, `${key}.agreeToTerms is missing the DPA link`).toContain("<dpaLink>");
  });

  it("keeps rich-text tags identical across locales", () => {
    const en = locale("en");
    const de = locale("de");

    for (const key of ACCEPTANCE_MESSAGE_KEYS)
      expect(richTags(de[key].agreeToTerms), `${key}.agreeToTerms tag mismatch`).toEqual(
        richTags(en[key].agreeToTerms),
      );
  });

  it("renders a DPA link in every acceptance surface", () => {
    const surfaces = [
      "app/[locale]/(protected)/onboarding/wizard/components/step-profile.tsx",
      "app/[locale]/(public)/auth/signup/sign-up-form.tsx",
      "app/[locale]/(public)/auth/signin/sign-in-form.tsx",
    ];

    for (const surface of surfaces) {
      const source = readFileSync(join(REPO_ROOT, surface), "utf8");
      expect(source, `${surface} does not render the DPA link`).toContain('href="/dpa"');
    }
  });
});
