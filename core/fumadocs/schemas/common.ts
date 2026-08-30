import { z } from "zod";

import { VisualBriefSchema } from "@/components/marketing/visuals/visual-contract";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

export const metaSchema = z.object({
  description: z.string(),
  title: z.string(),
});

const acquisitionFactReferenceSchema = z.enum([
  "product:agpl-community-core",
  "product:cloud-only-unified-inbox",
  "product:core-crm-records",
  "product:custom-fields-and-views",
  "product:deal-pipelines",
  "product:docker-postgresql-deployment",
  "product:hosted-mate-capability",
  "product:linkedin-messaging",
  "product:linkedin-social-workflows",
  "product:managed-cloud-region-and-security",
  "product:mcp-tools",
  "product:rest-and-webhooks",
  "product:sales-navigator-workflows",
  "product:self-hosted-starter-entitlements",
  "product:services-and-tasks",
  "product:cloud-plan-catalog",
  "product:unified-inbox-channels",
  "product:unified-inbox-entitlements",
  "product:weighted-deal-values",
]);

export const ACQUISITION_FACT_SOURCES = {
  "product:agpl-community-core": ["LICENSE", "ee/LICENSE.md"],
  "product:cloud-only-unified-inbox": ["ee/subscription/entitlements.ts"],
  "product:core-crm-records": [
    "features/mcp-tools/server-instructions.ts",
    "features/mcp-tools/contact.mcp-tools.ts",
    "features/mcp-tools/organization.mcp-tools.ts",
    "app/api/v1/contacts/route.ts",
    "app/api/v1/contacts/[id]/route.ts",
    "app/api/v1/organizations/route.ts",
    "app/api/v1/organizations/[id]/route.ts",
  ],
  "product:custom-fields-and-views": [
    "features/custom-column/custom-column.schema.ts",
    "components/data-view/data-view-content.tsx",
  ],
  "product:deal-pipelines": [
    "features/deals/deal.schema.ts",
    "features/mcp-tools/server-instructions.ts",
    "components/data-view/data-kanban-view.tsx",
  ],
  "product:docker-postgresql-deployment": ["docker-compose.yml"],
  "product:hosted-mate-capability": [
    "ee/agent-chat/agent-availability.ts",
    "ee/agent-chat/gated-tools.ts",
    "core/commercial/plan-catalog.ts",
    "ee/subscription/entitlements.ts",
  ],
  "product:linkedin-messaging": [
    "ee/messaging/provider.ts",
    "ee/messaging/connect/connect-channels.ts",
    "ee/messaging/outbound/start-chat.interactor.ts",
    "ee/messaging/outbound/send-chat-message.interactor.ts",
  ],
  "product:linkedin-social-workflows": [
    "features/mcp-tools/social-posts.mcp-tools.ts",
    "features/mcp-tools/tool-registry.ts",
    "app/api/v1/messaging/social-profiles/search/route.ts",
    "app/api/v1/messaging/social-posts/search/route.ts",
    "app/api/v1/messaging/social-post-engagement/search/route.ts",
    "app/api/v1/messaging/social-relations/search/route.ts",
    "app/api/v1/messaging/social-relations/invite/route.ts",
    "app/api/v1/messaging/social-relations/accept/route.ts",
    "app/api/v1/messaging/social-relations/cancel/route.ts",
  ],
  "product:managed-cloud-region-and-security": ["content/legal/en/dpa.mdx", "content/legal/en/subprocessors.mdx"],
  "product:mcp-tools": ["features/mcp-tools/tool-registry.ts", "features/mcp-tools/server-instructions.ts"],
  "product:rest-and-webhooks": ["app/api/v1/openapi/route.ts", "features/webhook/webhook.schema.ts"],
  "product:sales-navigator-workflows": [
    "features/mcp-tools/sales-navigator.mcp-tools.ts",
    "ee/messaging/sales-navigator/sales-navigator.schema.ts",
    "app/api/v1/messaging/sales-navigator/search/people/route.ts",
    "app/api/v1/messaging/sales-navigator/search/companies/route.ts",
    "app/api/v1/messaging/sales-navigator/search/parameters/route.ts",
    "app/api/v1/messaging/sales-navigator/lists/search/route.ts",
    "app/api/v1/messaging/sales-navigator/lists/browse/route.ts",
    "app/api/v1/messaging/sales-navigator/lists/save/route.ts",
    "content/docs/en/mcp.mdx",
  ],
  "product:self-hosted-starter-entitlements": ["ee/subscription/entitlements.ts"],
  "product:services-and-tasks": ["features/services/service.schema.ts", "features/tasks/task.schema.ts"],
  "product:cloud-plan-catalog": ["core/commercial/plan-catalog.ts", "ee/subscription/entitlements.ts"],
  "product:unified-inbox-channels": ["ee/messaging/provider.ts", "ee/messaging/connect/connect-channels.ts"],
  "product:unified-inbox-entitlements": [
    "core/commercial/plan-catalog.ts",
    "ee/subscription/entitlements.ts",
    "ee/messaging/connect/create-auth-link.interactor.ts",
    "ee/messaging/persistence/prisma-connected-account.repository.ts",
  ],
  "product:weighted-deal-values": ["features/deals/deal-weighting.ts"],
} as const satisfies Record<z.infer<typeof acquisitionFactReferenceSchema>, readonly string[]>;

const acquisitionExcludedClaimSchema = z.enum([
  "claim:no-delivery-management",
  "claim:no-hosted-ai-self-hosted",
  "claim:no-import-export",
  "claim:no-invoicing",
  "claim:no-linkedin-bulk-import",
  "claim:no-linkedin-crm-sync",
  "claim:no-native-linkedin-enrichment-monitoring",
  "claim:no-predictive-sales-analytics",
  "claim:no-proposal-automation",
  "claim:no-psa",
  "claim:no-self-hosted-inbox",
  "claim:no-time-tracking",
  "claim:no-unsupported-channels",
]);

export const ctaSchema = z.object({
  action: z.string(),
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  description: z.string(),
  hint: z.string(),
});

export const relatedHrefsSchema = z
  .array(z.string().regex(/^\/(?:blog|compare|docs|features|for)\/[a-z0-9]+(?:-[a-z0-9]+)*$/u))
  .length(4)
  .refine((items) => new Set(items).size === items.length, "Related page links must be unique");

export const acquisitionPageSchema = z.strictObject({
  clusterId: z.enum(["ai-agentic-mcp", "open-source-self-hosted", "professional-services", "unified-inbox"]),
  cta: ctaSchema,
  locale: z.enum(CONTENT_LOCALES),
  metadata: metaSchema,
  primaryIntent: z.string().trim().min(8).max(120),
  proof: z.strictObject({
    excludedClaims: z.array(acquisitionExcludedClaimSchema).min(1),
    factReferences: z.array(acquisitionFactReferenceSchema).min(1),
  }),
  relatedHrefs: relatedHrefsSchema,
  role: z.enum(["hub", "support"]),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  structuredData: z.strictObject({
    faqFromRenderedContent: z.literal(true),
    types: z.array(z.enum(["Article", "BreadcrumbList", "FAQPage", "SoftwareApplication"])).min(2),
  }),
  visual: VisualBriefSchema,
});
export type AcquisitionPage = z.infer<typeof acquisitionPageSchema>;

export const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  description: z.string(),
  hint: z.string(),
  showOpenSourceBadge: z.boolean().optional(),
  title: z.string(),
  titleAccent: z.string().optional(),
});
export type Hero = z.infer<typeof heroSchema>;

export const faqItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
});
export type FAQItem = z.infer<typeof faqItemSchema>;

export const faqSchema = z.object({
  faqs: z.array(faqItemSchema),
  title: z.string().optional(),
});

const featureItemSchema = z.object({
  description: z.string(),
  icon: z.string(),
  image: z.string().optional(),
  title: z.string(),
});

export const featuresSchema = z.object({
  badge: z.string(),
  features: z.array(featureItemSchema),
  subtitle: z.string(),
  title: z.string(),
});
export type Features = z.infer<typeof featuresSchema>;
