import { type ProductDemoPath, productDemoPath } from "./product-demo";

import {
  PROFESSIONAL_SERVICES_SOLUTION_ID,
  SOLUTION_CATALOG,
  type SolutionCatalogEntry,
  type SolutionId,
  findSolution,
} from "@/core/solutions/solution-catalog";

export type ProductDemoConfig = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
  solutionId?: SolutionId;
};

const INDUSTRY_PREFIX = "/for/";

const PROFESSIONAL_SERVICES_SLUG = "professional-services";

export function solutionProductDemo(solution: SolutionCatalogEntry): ProductDemoConfig {
  return {
    path: productDemoPath(solution.previewRoute),
    solutionId: solution.id,
  };
}

export const INDUSTRY_PRODUCT_DEMOS: Readonly<Record<string, ProductDemoConfig>> = Object.fromEntries([
  ...SOLUTION_CATALOG.filter((solution) => solution.landingPath.startsWith(INDUSTRY_PREFIX)).map((solution) => [
    solution.landingPath.slice(INDUSTRY_PREFIX.length),
    solutionProductDemo(solution),
  ]),
  [PROFESSIONAL_SERVICES_SLUG, solutionProductDemo(findSolution(PROFESSIONAL_SERVICES_SOLUTION_ID))],
]);

export function productDemoForIndustry(slug: string): ProductDemoConfig | null {
  return Object.hasOwn(INDUSTRY_PRODUCT_DEMOS, slug) ? INDUSTRY_PRODUCT_DEMOS[slug] : null;
}
