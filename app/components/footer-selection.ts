export const FOOTER_COLUMN_SIZE = 6;

export const FOOTER_PREFERRED_SLUGS = {
  "blog-posts": [
    "agentic-crm",
    "open-source-crm",
    "customer-communication-management",
    "crm-software",
    "crm-examples",
    "customer-retention-management",
  ],
  "compare-pages": [
    "gohighlevel",
    "notion-alternative",
    "hubspot-vs-salesforce",
    "vtiger-alternative",
    "folk",
    "cobra-alternative",
  ],
  "feature-pages": ["self-hosted", "unified-inbox", "cloud-crm", "contact-management", "sales-tracking", "pipeline"],
  "for-pages": ["professional-services", "agencies", "recruiting", "healthcare", "ecommerce", "property-management"],
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
