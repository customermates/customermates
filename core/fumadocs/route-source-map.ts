import type { PUBLIC_ROUTES_SEO } from "@/i18n/routing";
import type { apiOverviewSource } from "./source";

import {
  affiliateSource,
  authSource,
  automationSource,
  blogPostsSource,
  blogSource,
  comparePagesSource,
  compareSource,
  docsSource,
  featurePagesSource,
  featuresAllSource,
  featuresSource,
  forPagesSource,
  forSource,
  helpAndFeedbackSource,
  homepageSource,
  legalSource,
  pricingSource,
} from "./source";

type Loader =
  | typeof affiliateSource
  | typeof apiOverviewSource
  | typeof authSource
  | typeof automationSource
  | typeof blogPostsSource
  | typeof blogSource
  | typeof comparePagesSource
  | typeof compareSource
  | typeof docsSource
  | typeof featurePagesSource
  | typeof featuresAllSource
  | typeof featuresSource
  | typeof forPagesSource
  | typeof forSource
  | typeof helpAndFeedbackSource
  | typeof homepageSource
  | typeof legalSource
  | typeof pricingSource;

export const ROUTE_SOURCE_MAP: Record<
  (typeof PUBLIC_ROUTES_SEO)[number],
  {
    source: Loader;
    path: string[];
  }
> = {
  "/": {
    source: homepageSource,
    path: [],
  },
  "/features": {
    source: featuresSource,
    path: ["features"],
  },
  "/features/all": {
    source: featuresAllSource,
    path: ["all"],
  },
  "/pricing": {
    source: pricingSource,
    path: ["pricing"],
  },
  "/n8n-crm": {
    source: automationSource,
    path: ["automation"],
  },
  "/help-and-feedback": {
    source: helpAndFeedbackSource,
    path: ["help-and-feedback"],
  },
  "/imprint": {
    source: legalSource,
    path: ["imprint"],
  },
  "/privacy": {
    source: legalSource,
    path: ["privacy"],
  },
  "/terms": {
    source: legalSource,
    path: ["terms"],
  },
  "/auth/signin": {
    source: authSource,
    path: ["signin"],
  },
  "/auth/signup": {
    source: authSource,
    path: ["signup"],
  },
  "/auth/forgot-password": {
    source: authSource,
    path: ["forgot-password"],
  },
  "/auth/reset-password": {
    source: authSource,
    path: ["reset-password"],
  },
  "/blog": {
    source: blogSource,
    path: ["blog"],
  },
  "/blog/:slug": {
    source: blogPostsSource,
    path: [":slug"],
  },
  "/compare": {
    source: compareSource,
    path: ["compare"],
  },
  "/compare/:competitor": {
    source: comparePagesSource,
    path: [":competitor"],
  },
  "/for": {
    source: forSource,
    path: ["for"],
  },
  "/for/:industry": {
    source: forPagesSource,
    path: [":industry"],
  },
  "/features/:slug": {
    source: featurePagesSource,
    path: [":slug"],
  },
  "/affiliate": {
    source: affiliateSource,
    path: ["affiliate"],
  },
  "/docs": {
    source: docsSource,
    path: ["intro-page"],
  },
  "/docs/:slug": {
    source: docsSource,
    path: [":slug"],
  },
};

export function getSourceFromRoute(
  route: keyof typeof ROUTE_SOURCE_MAP,
  params: Record<string, string> = {},
): { source: Loader; path: string[] } | null {
  const mapping = ROUTE_SOURCE_MAP[route];
  if (!mapping) return null;

  if (Object.keys(params).length > 0) {
    const path = mapping.path.map((part) => (part.startsWith(":") ? params[part.slice(1)] : part));
    return { source: mapping.source, path };
  }

  return mapping;
}
