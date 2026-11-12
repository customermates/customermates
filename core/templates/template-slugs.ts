export const TEMPLATE_SLUGS = [
  "action-item-tracker",
  "client-intake",
  "client-tracker",
  "content-calendar",
  "creative-bookings",
  "custom-crm",
  "nonprofit-donors-and-members",
  "real-estate-pipeline",
  "sales-pipeline",
  "vc-deal-flow",
] as const;

export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

export function isTemplateSlug(value: unknown): value is TemplateSlug {
  return typeof value === "string" && (TEMPLATE_SLUGS as readonly string[]).includes(value);
}
