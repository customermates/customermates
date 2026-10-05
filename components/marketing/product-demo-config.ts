import { DEMO_RECORD_LIST_PATHS, type ProductDemoPath } from "./product-demo";

export type ProductDemoConfig = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
};

export const FEATURE_PRODUCT_DEMOS = {
  "account-management": { path: DEMO_RECORD_LIST_PATHS.organizations },
  api: { path: "/profile/api-keys" },
  "cloud-crm": { hostedBoundary: true, path: "/dashboard" },
  "contact-management": { path: DEMO_RECORD_LIST_PATHS.contacts },
  "crm-integration": { path: "/company/webhooks" },
  "customer-service": { hostedBoundary: true, path: "/inbox" },
  "email-integration": { hostedBoundary: true, path: "/inbox" },
  "follow-up": { path: DEMO_RECORD_LIST_PATHS.tasks },
  integrations: { hostedBoundary: true, path: "/profile/connected-accounts" },
  "lead-management": { path: DEMO_RECORD_LIST_PATHS.contacts },
  "lead-tracking": { path: DEMO_RECORD_LIST_PATHS.deals },
  "linkedin-integration": { hostedBoundary: true, path: "/inbox" },
  "outlook-integration": { hostedBoundary: true, path: "/inbox" },
  pipeline: { path: DEMO_RECORD_LIST_PATHS.deals },
  "project-management": { path: DEMO_RECORD_LIST_PATHS.tasks },
  reporting: { path: "/dashboard" },
  "sales-automation": { path: "/company/webhooks" },
  "sales-tracking": { path: DEMO_RECORD_LIST_PATHS.deals },
  sales: { path: DEMO_RECORD_LIST_PATHS.deals },
  "self-hosted": { hostedBoundary: true, path: "/dashboard" },
  "simple-crm": { path: "/dashboard" },
  "slack-integration": { path: "/company/webhooks" },
  "task-management": { path: DEMO_RECORD_LIST_PATHS.tasks },
  "unified-inbox": { hostedBoundary: true, path: "/inbox" },
  "workflow-automation": { path: "/company/webhooks" },
} as const satisfies Record<string, ProductDemoConfig>;

export const INDUSTRY_PRODUCT_DEMOS = {
  "professional-services": { path: DEMO_RECORD_LIST_PATHS.deals },
} as const satisfies Record<string, ProductDemoConfig>;

export function productDemoForFeature(slug: string): ProductDemoConfig | null {
  return slug in FEATURE_PRODUCT_DEMOS ? FEATURE_PRODUCT_DEMOS[slug as keyof typeof FEATURE_PRODUCT_DEMOS] : null;
}

export function productDemoForIndustry(slug: string): ProductDemoConfig | null {
  return slug in INDUSTRY_PRODUCT_DEMOS ? INDUSTRY_PRODUCT_DEMOS[slug as keyof typeof INDUSTRY_PRODUCT_DEMOS] : null;
}
