export const TEMPLATE_SLUGS = [
  "action-item-tracker",
  "agency-client-pipeline",
  "applicant-tracking",
  "booking-page",
  "client-intake",
  "client-support-desk",
  "client-tracker",
  "consultant-engagements",
  "content-calendar",
  "creative-bookings",
  "custom-crm",
  "form-to-crm",
  "founder-sales-pipeline",
  "insurance-broker-pipeline",
  "law-firm-intake",
  "nonprofit-donors-and-members",
  "real-estate-pipeline",
  "recruiting-desk",
  "sales-pipeline",
  "supplier-questionnaire",
  "tax-bookkeeping-practice",
  "team-tracker",
  "trades-job-pipeline",
  "vc-deal-flow",
  "whatsapp-enquiry-follow-up",
] as const;

export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

export function isTemplateSlug(value: unknown): value is TemplateSlug {
  return typeof value === "string" && (TEMPLATE_SLUGS as readonly string[]).includes(value);
}
