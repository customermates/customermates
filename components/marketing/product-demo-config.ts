import type { ProductDemoPath } from "./product-demo";

export type ProductDemoConfig = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
};

export const FEATURE_PRODUCT_DEMOS = {
  api: { path: "/profile/api-keys" },
  "cloud-crm": { hostedBoundary: true, path: "/dashboard" },
  "contact-management": { path: "/contacts" },
  "follow-up": { path: "/tasks" },
  integrations: { hostedBoundary: true, path: "/profile/connected-accounts" },
  "lead-management": { path: "/contacts" },
  "linkedin-integration": { hostedBoundary: true, path: "/inbox" },
  "outlook-integration": { hostedBoundary: true, path: "/inbox" },
  pipeline: { path: "/deals" },
  reporting: { path: "/dashboard" },
  sales: { path: "/deals" },
  "self-hosted": { hostedBoundary: true, path: "/dashboard" },
  "simple-crm": { path: "/dashboard" },
  "task-management": { path: "/tasks" },
  "unified-inbox": { hostedBoundary: true, path: "/inbox" },
  "workflow-automation": { path: "/company/webhooks" },
} as const satisfies Record<string, ProductDemoConfig>;

export const INDUSTRY_PRODUCT_DEMOS = {
  "professional-services": { path: "/deals" },
} as const satisfies Record<string, ProductDemoConfig>;

export function productDemoForFeature(slug: string): ProductDemoConfig | null {
  return slug in FEATURE_PRODUCT_DEMOS ? FEATURE_PRODUCT_DEMOS[slug as keyof typeof FEATURE_PRODUCT_DEMOS] : null;
}

export function productDemoForIndustry(slug: string): ProductDemoConfig | null {
  return slug in INDUSTRY_PRODUCT_DEMOS ? INDUSTRY_PRODUCT_DEMOS[slug as keyof typeof INDUSTRY_PRODUCT_DEMOS] : null;
}
