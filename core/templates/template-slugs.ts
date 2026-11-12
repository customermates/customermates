export const TEMPLATE_SLUGS = ["client-tracker", "real-estate-pipeline", "sales-pipeline"] as const;

export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

export function isTemplateSlug(value: unknown): value is TemplateSlug {
  return typeof value === "string" && (TEMPLATE_SLUGS as readonly string[]).includes(value);
}
