import { DEMO_RECORD_LIST_PATHS, type ProductDemoPath, productDemoPath } from "./product-demo";

import {
  PROFESSIONAL_SERVICES_SOLUTION_ID,
  SOLUTION_CATALOG,
  type SolutionCatalogEntry,
  type SolutionId,
  findSolution,
  findSolutionByLandingPath,
} from "@/core/solutions/solution-catalog";

export type ProductDemoConfig = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
  solutionId?: SolutionId;
};

const FEATURE_DEMO_SURFACES = {
  api: { path: "/settings/api-keys" },
  "cloud-crm": { hostedBoundary: true, path: "/dashboard" },
  "contact-management": { path: DEMO_RECORD_LIST_PATHS.contacts },
  "follow-up": { path: DEMO_RECORD_LIST_PATHS.tasks },
  integrations: { hostedBoundary: true, path: "/settings/channels" },
  "lead-management": { path: DEMO_RECORD_LIST_PATHS.contacts },
  "linkedin-integration": { hostedBoundary: true, path: "/inbox" },
  "outlook-integration": { hostedBoundary: true, path: "/inbox" },
  pipeline: { path: DEMO_RECORD_LIST_PATHS.deals },
  reporting: { path: "/dashboard" },
  sales: { path: DEMO_RECORD_LIST_PATHS.deals },
  "self-hosted": { hostedBoundary: true, path: "/dashboard" },
  "simple-crm": { path: "/dashboard" },
  "task-management": { path: DEMO_RECORD_LIST_PATHS.tasks },
  "unified-inbox": { hostedBoundary: true, path: "/inbox" },
  "whatsapp-integration": { hostedBoundary: true, path: "/inbox" },
  "workflow-automation": { path: "/settings/webhooks" },
} as const satisfies Record<string, ProductDemoConfig>;

const FEATURE_PREFIX = "/features/";

const INDUSTRY_PREFIX = "/for/";

const PROFESSIONAL_SERVICES_SLUG = "professional-services";

export function solutionProductDemo(solution: SolutionCatalogEntry, surface?: ProductDemoConfig): ProductDemoConfig {
  return {
    ...(surface?.hostedBoundary ? { hostedBoundary: true } : {}),
    path: productDemoPath(solution.previewRoute),
    solutionId: solution.id,
  };
}

export const FEATURE_PRODUCT_DEMOS = Object.fromEntries(
  Object.entries(FEATURE_DEMO_SURFACES).map(([slug, surface]) => {
    const solution = findSolutionByLandingPath(`${FEATURE_PREFIX}${slug}`);
    return [slug, solution ? solutionProductDemo(solution, surface) : surface];
  }),
) as Record<keyof typeof FEATURE_DEMO_SURFACES, ProductDemoConfig>;

export const INDUSTRY_PRODUCT_DEMOS: Readonly<Record<string, ProductDemoConfig>> = Object.fromEntries([
  ...SOLUTION_CATALOG.filter((solution) => solution.landingPath.startsWith(INDUSTRY_PREFIX)).map((solution) => [
    solution.landingPath.slice(INDUSTRY_PREFIX.length),
    solutionProductDemo(solution),
  ]),
  [PROFESSIONAL_SERVICES_SLUG, solutionProductDemo(findSolution(PROFESSIONAL_SERVICES_SOLUTION_ID))],
]);

export function productDemoForFeature(slug: string): ProductDemoConfig | null {
  return Object.hasOwn(FEATURE_PRODUCT_DEMOS, slug)
    ? FEATURE_PRODUCT_DEMOS[slug as keyof typeof FEATURE_PRODUCT_DEMOS]
    : null;
}

export function productDemoForIndustry(slug: string): ProductDemoConfig | null {
  return Object.hasOwn(INDUSTRY_PRODUCT_DEMOS, slug) ? INDUSTRY_PRODUCT_DEMOS[slug] : null;
}
