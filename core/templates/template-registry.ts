import type { Capability } from "@/core/capabilities/capabilities";
import type { TemplateBundle, TemplateLocale, TemplateSpec } from "./template-spec.schema";
import type { TemplateSlug } from "./template-slugs";

import { SHIPPED_CAPABILITIES } from "@/core/capabilities/capabilities";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import clientTracker from "./bundles/client-tracker.json";
import realEstatePipeline from "./bundles/real-estate-pipeline.json";
import salesPipeline from "./bundles/sales-pipeline.json";
import { TEMPLATE_SLUGS } from "./template-slugs";

export { TEMPLATE_SLUGS, isTemplateSlug } from "./template-slugs";
export type { TemplateSlug } from "./template-slugs";

export type TemplateDeployment = "cloud" | "self-hosted";

export const CLOUD_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["calendarWrite"]);

const BUNDLES: Readonly<Record<TemplateSlug, TemplateBundle>> = {
  "client-tracker": clientTracker as unknown as TemplateBundle,
  "real-estate-pipeline": realEstatePipeline as unknown as TemplateBundle,
  "sales-pipeline": salesPipeline as unknown as TemplateBundle,
};

export function getTemplate(slug: TemplateSlug): TemplateSpec {
  return BUNDLES[slug].spec;
}

export function hasTemplateText(slug: TemplateSlug, locale: string): boolean {
  return BUNDLES[slug].text[locale] !== undefined;
}

export function getTemplateText(slug: TemplateSlug, locale: string): TemplateLocale {
  const text = BUNDLES[slug].text;
  const found = text[locale] ?? text[DEFAULT_LOCALE];
  if (!found) throw new Error(`Template ${slug} has no ${DEFAULT_LOCALE} text`);
  return found;
}

export function isTemplateOffered(
  slug: TemplateSlug,
  options: { deployment: TemplateDeployment; shipped?: ReadonlySet<Capability> },
): boolean {
  const shipped = options.shipped ?? SHIPPED_CAPABILITIES;
  return getTemplate(slug).requiresCapabilities.every(
    (capability) =>
      shipped.has(capability) && (options.deployment === "cloud" || !CLOUD_ONLY_CAPABILITIES.has(capability)),
  );
}

export type TemplateListing = {
  slug: TemplateSlug;
  spec: TemplateSpec;
  text: TemplateLocale;
  translated: boolean;
  status: TemplateSpec["status"][string] | null;
  publicPage: TemplateSpec["publicPage"][string] | null;
  offered: boolean;
};

export function listTemplates(options: {
  locale: string;
  publishedOnly?: boolean;
  deployment?: TemplateDeployment;
  shipped?: ReadonlySet<Capability>;
}): TemplateListing[] {
  const deployment = options.deployment ?? "cloud";
  return TEMPLATE_SLUGS.map((slug) => {
    const spec = getTemplate(slug);
    return {
      slug,
      spec,
      text: getTemplateText(slug, options.locale),
      translated: hasTemplateText(slug, options.locale),
      status: spec.status[options.locale] ?? null,
      publicPage: spec.publicPage[options.locale] ?? null,
      offered: isTemplateOffered(slug, { deployment, shipped: options.shipped }),
    };
  }).filter((listing) => !options.publishedOnly || (listing.status === "published" && listing.offered));
}
