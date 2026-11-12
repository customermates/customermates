import type { TemplateLocale, TemplateSpec } from "@/core/templates/template-spec.schema";
import type { TemplateSlug } from "@/core/templates/template-registry";

import { getTemplate, getTemplateText } from "@/core/templates/template-registry";
import { TemplateSpecSchema } from "@/core/templates/template-spec.schema";
import { templateSpecIssues } from "@/core/templates/template-validation";

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
