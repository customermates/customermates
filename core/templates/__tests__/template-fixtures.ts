import type { TemplateBundle, TemplateLocale, TemplateSpec } from "@/core/templates/template-spec.schema";
import type { TemplateSlug } from "@/core/templates/template-registry";

import { loadTemplateBundle } from "@/core/templates/template-bundle-loader";
import { TEMPLATE_SLUGS } from "@/core/templates/template-registry";
import { TemplateSpecSchema } from "@/core/templates/template-spec.schema";
import { templateSpecIssues } from "@/core/templates/template-validation";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

const BUNDLES = new Map<TemplateSlug, TemplateBundle>(
  await Promise.all(
    TEMPLATE_SLUGS.map(async (slug) => {
      const bundle = await loadTemplateBundle(slug);
      if (!bundle) throw new Error(`Template ${slug} has no bundle`);
      return [slug, bundle] as const;
    }),
  ),
);

function bundleOf(slug: TemplateSlug): TemplateBundle {
  const bundle = BUNDLES.get(slug);
  if (!bundle) throw new Error(`Template ${slug} has no bundle`);
  return bundle;
}

export function getTemplate(slug: TemplateSlug): TemplateSpec {
  return bundleOf(slug).spec;
}

export function getTemplateText(slug: TemplateSlug, locale: string): TemplateLocale {
  const { text } = bundleOf(slug);
  const found = text[locale] ?? text[DEFAULT_LOCALE];
  if (!found) throw new Error(`Template ${slug} has no ${DEFAULT_LOCALE} text`);
  return found;
}

export function cloneSpec(slug: TemplateSlug = "client-tracker"): TemplateSpec {
  return structuredClone(getTemplate(slug));
}

export function cloneText(slug: TemplateSlug = "client-tracker", locale = "en"): TemplateLocale {
  return structuredClone(getTemplateText(slug, locale));
}

export function specIssuesAfter(change: (spec: TemplateSpec) => void, slug: TemplateSlug = "client-tracker"): string[] {
  const spec = cloneSpec(slug);
  change(spec);
  return templateSpecIssues(spec).map((issue) => issue.message);
}

export function schemaMessagesAfter(
  change: (spec: TemplateSpec) => void,
  slug: TemplateSlug = "client-tracker",
): string[] {
  const spec = cloneSpec(slug);
  change(spec);
  const parsed = TemplateSpecSchema.safeParse(spec);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}
