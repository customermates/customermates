import { describe, expect, it } from "vitest";

import { isTemplateOffered } from "@/core/templates/template-publication";
import {
  TEMPLATE_SLUGS,
  getTemplate,
  getTemplateText,
  hasTemplateText,
  isTemplateSlug,
  listOfferedTemplates,
  loadTemplate,
} from "@/core/templates/template-registry";

describe("template registry", () => {
  it("lists the slugs and validates them", () => {
    expect([...TEMPLATE_SLUGS]).toEqual([...TEMPLATE_SLUGS].sort());
    expect(TEMPLATE_SLUGS).toContain("client-tracker");
    expect(isTemplateSlug("sales-pipeline")).toBe(true);
    expect(isTemplateSlug("nope")).toBe(false);
    expect(isTemplateSlug(undefined)).toBe(false);
  });

  it("returns the spec and the text of a locale", async () => {
    expect((await getTemplate("client-tracker")).slug).toBe("client-tracker");
    expect((await getTemplateText("client-tracker", "de")).name).toBe("Kundenverwaltung");
    expect(hasTemplateText("client-tracker", "de")).toBe(true);
  });

  it("loads the spec and the text of a locale together", async () => {
    const { spec, text } = await loadTemplate("client-tracker", "de");
    expect(spec.slug).toBe("client-tracker");
    expect(text.locale).toBe("de");
  });

  it("falls back to the English text for a locale without a file", async () => {
    expect(hasTemplateText("client-tracker", "xx")).toBe(false);
    expect((await getTemplateText("client-tracker", "xx")).locale).toBe("en");
    expect((await loadTemplate("client-tracker", "xx")).text.locale).toBe("en");
  });

  it("answers what the light index knows without loading a bundle, and agrees with every bundle", async () => {
    const listings = listOfferedTemplates({ locale: "en", deployment: "cloud" });
    for (const slug of TEMPLATE_SLUGS) {
      const { spec, text } = await loadTemplate(slug, "en");
      expect(spec.slug).toBe(slug);
      expect(Object.keys(spec.publication).every((locale) => hasTemplateText(slug, locale))).toBe(true);
      expect(listings.find((listing) => listing.slug === slug)?.name).toBe(text.name);
    }
  });

  it("offers every template in the cloud and keeps the cloud-only capability out of a self-hosted deployment", async () => {
    expect(listOfferedTemplates({ locale: "en", deployment: "cloud" }).map((listing) => listing.slug)).toEqual([
      ...TEMPLATE_SLUGS,
    ]);
    const selfHosted = listOfferedTemplates({ locale: "en", deployment: "self-hosted" }).map((listing) => listing.slug);
    expect(selfHosted).toContain("sales-pipeline");
    expect(selfHosted).not.toContain("real-estate-pipeline");
    for (const slug of TEMPLATE_SLUGS) {
      const { spec } = await loadTemplate(slug, "en");
      expect(selfHosted.includes(slug)).toBe(isTemplateOffered(spec, "self-hosted"));
    }
  });

  it("lists templates with the text of the locale", () => {
    const listings = listOfferedTemplates({ locale: "de", deployment: "cloud" });
    expect(listings.map((listing) => listing.slug)).toEqual([...TEMPLATE_SLUGS]);
    expect(listings.every((listing) => listing.translated)).toBe(true);
    expect(listings.find((listing) => listing.slug === "client-tracker")?.name).toBe("Kundenverwaltung");
    expect(listOfferedTemplates({ locale: "xx", deployment: "cloud" }).every((listing) => !listing.translated)).toBe(
      true,
    );
  });
});
