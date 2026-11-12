import { describe, expect, it } from "vitest";

import {
  CLOUD_ONLY_CAPABILITIES,
  TEMPLATE_SLUGS,
  getTemplate,
  getTemplateText,
  hasTemplateText,
  isTemplateOffered,
  isTemplateSlug,
  listTemplates,
  loadTemplate,
} from "@/core/templates/template-registry";

import type { Capability } from "@/core/capabilities/capabilities";

const ALL: ReadonlySet<Capability> = new Set<Capability>([
  "forms",
  "rules",
  "calendarWrite",
  "notifications",
  "incomingWebhooks",
]);

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
    const listings = listTemplates({ locale: "en", shipped: ALL });
    for (const slug of TEMPLATE_SLUGS) {
      const { spec, text } = await loadTemplate(slug, "en");
      expect(spec.slug).toBe(slug);
      expect(Object.keys(spec.status).every((locale) => hasTemplateText(slug, locale))).toBe(true);
      expect(listings.find((listing) => listing.slug === slug)?.name).toBe(text.name);
      expect(isTemplateOffered(slug, { deployment: "cloud", shipped: ALL })).toBe(
        spec.requiresCapabilities.every((capability) => ALL.has(capability)),
      );
    }
  });

  it("offers nothing while no capability has shipped", () => {
    const shipped = new Set<Capability>();
    for (const slug of TEMPLATE_SLUGS) expect(isTemplateOffered(slug, { deployment: "cloud", shipped })).toBe(false);
    expect(listTemplates({ locale: "en", publishedOnly: true, shipped })).toEqual([]);
  });

  it("offers a template once every capability it requires has shipped", () => {
    const shipped = new Set<Capability>(["forms", "rules", "notifications"]);
    expect(isTemplateOffered("sales-pipeline", { deployment: "cloud", shipped })).toBe(true);
    expect(isTemplateOffered("sales-pipeline", { deployment: "self-hosted", shipped })).toBe(true);
    expect(isTemplateOffered("real-estate-pipeline", { deployment: "cloud", shipped })).toBe(false);
    shipped.delete("rules");
    expect(isTemplateOffered("sales-pipeline", { deployment: "cloud", shipped })).toBe(false);
  });

  it("does not offer a cloud-only capability to a self-hosted deployment", () => {
    expect(CLOUD_ONLY_CAPABILITIES.has("calendarWrite")).toBe(true);
    expect(isTemplateOffered("real-estate-pipeline", { deployment: "cloud", shipped: ALL })).toBe(true);
    expect(isTemplateOffered("real-estate-pipeline", { deployment: "self-hosted", shipped: ALL })).toBe(false);
  });

  it("lists templates with the text of the locale and the publication state", () => {
    const listings = listTemplates({ locale: "de", shipped: ALL });
    expect(listings.map((listing) => listing.slug)).toEqual([...TEMPLATE_SLUGS]);
    expect(listings.every((listing) => listing.translated && listing.offered)).toBe(true);
    expect(listings.find((listing) => listing.slug === "client-tracker")?.name).toBe("Kundenverwaltung");
    expect(listings.every((listing) => listing.status === "draft")).toBe(true);
    expect(
      listTemplates({ locale: "xx", shipped: ALL }).every((listing) => !listing.translated && listing.status === null),
    ).toBe(true);
  });

  it("lists only published and offered templates when asked", () => {
    expect(listTemplates({ locale: "en", publishedOnly: true, shipped: ALL })).toEqual([]);
  });
});
