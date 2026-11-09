import { describe, expect, it } from "vitest";

import { CreateWikiPagesSchema } from "@/features/wiki/create-wiki-pages.interactor";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { ONBOARDING_PLAYBOOKS, parseOnboardingPlaybook, suggestedOnboardingPlaybook } from "../onboarding-playbook";
import { onboardingPlaybookPages } from "../onboarding-playbook-pages";

const PAGE_ID = "6f1c2f0e-8d4b-4c3a-9a51-2b7d9c0e4f11";

describe("onboarding playbooks", () => {
  it.each([
    ["/for/consultants", "consultants"],
    ["/de/for/agencies", "agencies"],
    ["/fr/for/freelancers/", "freelancers"],
    ["/en/for/smb", "smb"],
    ["/en/consultants", "consultants"],
    ["/features/pipeline", null],
    ["/for/startups", null],
    ["/auth/signup", null],
    [null, null],
  ])("suggests the playbook for the signup landing path %j", (landingPath, expected) => {
    expect(suggestedOnboardingPlaybook(landingPath)).toBe(expected);
  });

  it("parses only known playbooks", () => {
    expect(parseOnboardingPlaybook("agencies")).toBe("agencies");
    expect(parseOnboardingPlaybook("crm")).toBeNull();
    expect(parseOnboardingPlaybook(undefined)).toBeNull();
  });

  it.each(APP_LOCALES.flatMap((locale) => ONBOARDING_PLAYBOOKS.map((playbook) => [locale, playbook] as const)))(
    "writes valid %s pages for the %s playbook",
    async (locale, playbook) => {
      const { pages, guide } = await onboardingPlaybookPages(locale, playbook);

      expect(pages.map((page) => page.kind)).toEqual(["knowledge", "knowledge", "procedure"]);
      expect(new Set(pages.map((page) => page.title)).size).toBe(3);
      expect(CreateWikiPagesSchema.safeParse({ pages, requireEmpty: true }).success).toBe(true);
      for (const page of pages) {
        expect(page.markdown).toMatch(/^## |\n## /u);
        expect(page.markdown).not.toMatch(/[–—]/u);
      }

      const linked = guide(
        pages.map((page, index) => ({ id: PAGE_ID.replace(/1$/u, String(index)), title: page.title })),
      );
      expect(linked.kind).toBe("guide");
      expect(CreateWikiPagesSchema.safeParse({ pages: [linked], requireEmpty: false }).success).toBe(true);
      for (const page of pages) expect(linked.markdown).toContain(page.title);
      expect(linked.markdown).toContain("/wiki?page=");
    },
  );

  it("gives every job its own sales playbook, tone and follow-up rules", async () => {
    const written = await Promise.all(ONBOARDING_PLAYBOOKS.map((playbook) => onboardingPlaybookPages("en", playbook)));
    for (const index of [0, 1, 2]) {
      const bodies = written.map(({ pages }) => pages[index].markdown);
      expect(new Set(bodies).size).toBe(ONBOARDING_PLAYBOOKS.length);
    }
    expect(written[0].pages.map((page) => page.title)).toEqual(["Sales playbook", "Tone of voice", "Follow-up rules"]);
    expect(written[0].guide([]).markdown).toContain("Consultants playbook");
  });
});
