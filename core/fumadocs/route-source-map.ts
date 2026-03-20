import type { PUBLIC_ROUTES_SEO } from "@/i18n/routing";

import {
  affiliateSource,
  apiDocsSource,
  apiOverviewSource,
  authSource,
  automationSource,
  blogPostsSource,
  blogSource,
  compareSource,
  docsSource,
  featuresSource,
  helpAndFeedbackSource,
  homepageSource,
  legalSource,
  pricingSource,
  skillsOverviewSource,
  skillsSource,
} from "./source";

type Loader =
  | typeof affiliateSource
  | typeof apiDocsSource
  | typeof apiOverviewSource
  | typeof authSource
  | typeof automationSource
  | typeof blogPostsSource
  | typeof blogSource
  | typeof compareSource
  | typeof docsSource
  | typeof featuresSource
  | typeof helpAndFeedbackSource
  | typeof homepageSource
  | typeof legalSource
  | typeof pricingSource
  | typeof skillsOverviewSource
  | typeof skillsSource;

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
  "/compare/:competitor": {
    source: compareSource,
    path: [":competitor"],
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
  "/docs/openapi": {
    source: apiOverviewSource,
    path: ["openapi"],
  },
  "/docs/openapi/:slug": {
    source: apiDocsSource,
    path: [":slug"],
  },
  "/docs/skills": {
    source: skillsOverviewSource,
    path: ["skills"],
  },
  "/docs/skills/:slug": {
    source: skillsSource,
    path: [":slug"],
  },
};

export function getSourceFromRoute(
  route: keyof typeof ROUTE_SOURCE_MAP,
  params: Record<string, string> = {},
): { source: Loader; path: string[] } | null {
  if (route in ROUTE_SOURCE_MAP) {
    const mapping = ROUTE_SOURCE_MAP[route];
    if (Object.keys(params).length > 0) {
      const path = mapping.path.map((part) => (part.startsWith(":") ? params[part.slice(1)] : part));
      return { source: mapping.source, path };
    }
    return mapping;
  }

  return null;
}
