export const FOOTER_COLUMN_SIZE = 6;

export const FOOTER_PREFERRED_SLUGS = {
  "blog-posts": [
    "customer-interaction-management",
    "customer-retention-management",
    "crm-examples",
    "customer-communication-management",
    "crm-software",
    "agentic-ai",
  ],
  "compare-pages": [
    "gohighlevel",
    "notion-alternative",
    "hubspot-vs-salesforce",
    "vtiger-alternative",
    "folk",
    "cobra-alternative",
  ],
  "feature-pages": [
    "cloud-crm",
    "sales-tracking",
    "lead-management",
    "sales-automation",
    "contact-management",
    "reporting",
  ],
  "for-pages": ["healthcare", "ecommerce", "recruiting", "construction", "manufacturing", "property-management"],
} as const;

export type FooterCollection = keyof typeof FOOTER_PREFERRED_SLUGS;

export function selectFooterSlugs(
  collection: FooterCollection,
  available: readonly string[],
  size: number = FOOTER_COLUMN_SIZE,
): string[] {
  const pool = new Set(available);
  const selected: string[] = [];

  for (const slug of FOOTER_PREFERRED_SLUGS[collection]) {
    if (selected.length >= size) break;
    if (!pool.delete(slug)) continue;
    selected.push(slug);
  }

  for (const slug of [...pool].sort()) {
    if (selected.length >= size) break;
    selected.push(slug);
  }

  return selected;
}
