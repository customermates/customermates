import type { ProductDemoConfig } from "./product-demo-config";

import { MarketingSection } from "./marketing-section";
import { ProductDemo } from "./product-demo";

export function ProductDemoSection({ hostedBoundary = false, path, solutionId }: ProductDemoConfig) {
  return (
    <MarketingSection divider className="py-12 sm:py-16 lg:py-20" containerSize="wide">
      <ProductDemo hostedBoundary={hostedBoundary} path={path} presentation="standalone" solutionId={solutionId} />
    </MarketingSection>
  );
}
