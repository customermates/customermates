import { describe, expect, it } from "vitest";

import { compileTemplate } from "@/core/templates/compile-template";
import { renderTemplatePrompt } from "@/core/templates/template-prompt";
import { resolveTemplateRule, templateCountry } from "@/core/templates/template-rule-variants";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";
import { TemplateLocaleSchema, TemplateSpecSchema } from "@/core/templates/template-spec.schema";
import { templateTextIssues } from "@/core/templates/template-text-validation";

import { cloneSpec, cloneText, specIssuesAfter } from "./template-fixtures";

type SetDates = { kind: "set_dates"; dates: Array<{ field: string; offsetDays: number }> };

function clockOffset(slug: (typeof TEMPLATE_SLUGS)[number], key: string, locale: string, country?: string) {
  const spec = cloneSpec(slug);
  const { extras } = compileTemplate(spec, cloneText(slug, locale), { country });
  const camelKey = key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  const rule = extras.rules.find((candidate) => candidate.key === camelKey);
  const action = rule?.action as SetDates | undefined;
  return { offset: action?.dates[0]?.offsetDays, title: rule?.title, description: rule?.description };
}

describe("templateCountry", () => {
  it("prefers a valid workspace country over the country of the locale", () => {
    expect(templateCountry("de", "br")).toBe("BR");
    expect(templateCountry("de", " pl ")).toBe("PL");
  });

  it("falls back to the country of the locale", () => {
    expect(templateCountry("pt")).toBe("BR");
    expect(templateCountry("pl", null)).toBe("PL");
    expect(templateCountry("en", "not a country")).toBe("US");
    expect(templateCountry("xx")).toBe("US");
  });
});

describe("rule variants", () => {
  it("keeps the default offset for every locale except the Brazilian one", () => {
    expect(clockOffset("client-support-desk", "data_request_clock", "de").offset).toBe(30);
    expect(clockOffset("client-support-desk", "data_request_clock", "en").offset).toBe(30);
    expect(clockOffset("client-support-desk", "data_request_clock", "pt").offset).toBe(15);
    expect(clockOffset("trades-job-pipeline", "withdrawal_clock", "fr").offset).toBe(14);
    expect(clockOffset("trades-job-pipeline", "withdrawal_clock", "pt").offset).toBe(7);
  });

  it("uses the workspace country before the locale of the text", () => {
    const brazil = clockOffset("client-support-desk", "data_request_clock", "de", "BR");
    expect(brazil.offset).toBe(15);
    expect(brazil.title).toContain("15");
    expect(brazil.title).toContain("LGPD");
    expect(clockOffset("client-support-desk", "data_request_clock", "pt", "PT").offset).toBe(30);
    expect(clockOffset("client-support-desk", "data_request_clock", "en", "ZZ").offset).toBe(30);
  });

  it("writes the title of the variant that applies", () => {
    const base = clockOffset("trades-job-pipeline", "withdrawal_clock", "en");
    const brazil = clockOffset("trades-job-pipeline", "withdrawal_clock", "pt");
    expect(base.title).toContain("14-day");
    expect(base.description).toBe("");
    expect(brazil.title).toContain("7");
    expect(brazil.description).toContain("art. 49");
  });

  it("sets the shorter Polish retention period only for Poland", () => {
    expect(clockOffset("applicant-tracking", "rejection_retention", "en").offset).toBe(180);
    expect(clockOffset("applicant-tracking", "rejection_retention", "de").offset).toBe(180);
    const poland = clockOffset("applicant-tracking", "rejection_retention", "pl");
    expect(poland.offset).toBe(30);
    expect(poland.description).toContain("UODO");
    expect(clockOffset("applicant-tracking", "rejection_retention", "en", "PL").offset).toBe(30);
  });

  it("leaves every rule of the other templates untouched", () => {
    const spec = cloneSpec("sales-pipeline");
    for (const rule of spec.followUpRules) expect(resolveTemplateRule(rule, "BR")).toBe(rule);
  });

  it("changes only what the variant names", () => {
    const spec = cloneSpec("client-support-desk");
    const rule = spec.followUpRules.find((candidate) => candidate.key === "data_request_clock");
    if (!rule) throw new Error("rule missing");
    const brazil = resolveTemplateRule(rule, "BR");
    expect(brazil.trigger).toEqual(rule.trigger);
    expect(brazil.needs).toBe(rule.needs);
    expect(brazil.dueOffsetDays).toBe(rule.dueOffsetDays);
    expect(brazil.action).not.toEqual(rule.action);
  });

  it("puts the variant into the prompt of a Brazilian workspace", () => {
    const options = { deployment: "cloud", signupUrl: "https://customermates.com/signup" } as const;
    const spec = cloneSpec("client-support-desk");
    const portuguese = renderTemplatePrompt(spec, cloneText("client-support-desk", "pt"), options);
    expect(portuguese).toContain("em 15 dias");
    expect(portuguese).not.toContain("em 30 dias");
    const german = renderTemplatePrompt(spec, cloneText("client-support-desk", "de"), options);
    expect(german).toContain("30 Tage");
    const germanInBrazil = renderTemplatePrompt(spec, cloneText("client-support-desk", "de"), {
      ...options,
      country: "BR",
    });
    expect(germanInBrazil).toContain("15 Tage");
  });

  it("has text for every variant in every locale", () => {
    for (const slug of TEMPLATE_SLUGS) {
      const spec = cloneSpec(slug);
      for (const locale of Object.keys(spec.status)) {
        expect(templateTextIssues(spec, cloneText(slug, locale), locale)).toEqual([]);
        for (const rule of spec.followUpRules) {
          for (const country of Object.keys(rule.variants ?? {}))
            expect(cloneText(slug, locale).rules[rule.key]?.variants?.[country]?.title).toBeTruthy();
        }
      }
    }
  });
});

describe("rule variant validation", () => {
  const SLUG = "trades-job-pipeline";

  function variantRule(spec: ReturnType<typeof cloneSpec>) {
    const rule = spec.followUpRules.find((candidate) => candidate.key === "withdrawal_clock");
    if (!rule) throw new Error("rule missing");
    return rule;
  }

  it("rejects a variant for a country outside the jurisdictions", () => {
    const messages = specIssuesAfter((spec) => {
      variantRule(spec).variants = { JP: { dueOffsetDays: 1 } };
    }, SLUG);
    expect(messages).toContain("JP is not one of the jurisdictions.");
  });

  it("checks the parts a variant replaces like the rest of the rule", () => {
    const messages = specIssuesAfter((spec) => {
      variantRule(spec).variants = {
        BR: { action: { kind: "set_dates", dates: [{ field: "jobs.ghost_date", offsetDays: 7 }] } },
      };
    }, SLUG);
    expect(messages.join()).toContain("jobs.ghost_date");
  });

  it("rejects an empty variant and a country that is not a code", () => {
    const empty = cloneSpec(SLUG);
    variantRule(empty).variants = { BR: {} };
    expect(TemplateSpecSchema.safeParse(empty).success).toBe(false);
    const lower = cloneSpec(SLUG);
    variantRule(lower).variants = { br: { dueOffsetDays: 1 } };
    expect(TemplateSpecSchema.safeParse(lower).success).toBe(false);
  });

  it("reports a variant text that is missing or surplus", () => {
    const missing = cloneText(SLUG, "de");
    const copy = missing.rules.withdrawal_clock;
    if (copy) delete copy.variants;
    expect(templateTextIssues(cloneSpec(SLUG), missing, "de")).toContain(
      "rules.withdrawal_clock.variants.BR is missing",
    );

    const surplus = cloneText(SLUG, "de");
    const other = surplus.rules.call_back_new;
    if (other) other.variants = { BR: { title: "Anrufen", description: "" } };
    expect(templateTextIssues(cloneSpec(SLUG), surplus, "de")).toContain(
      "rules.call_back_new.variants.BR is not in the spec",
    );
  });

  it("accepts a variant text with its own title and description", () => {
    const parsed = TemplateLocaleSchema.safeParse(cloneText(SLUG, "pt"));
    expect(parsed.success).toBe(true);
  });
});
