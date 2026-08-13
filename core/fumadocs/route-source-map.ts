import type { PUBLIC_ROUTES_SEO } from "@/i18n/routing";

import { CONTENT_DYNAMIC_ROUTES } from "./content-route-contract";

import {
  affiliateSource,
  apiDocsSource,
  apiOverviewSource,
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

export const ROUTE_SOURCE_MAP = {
  "/": {
    source: homepageSource,
    path: ["homepage"],
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
  "/subprocessors": {
    source: legalSource,
    path: ["subprocessors"],
  },
  "/dpa": {
    source: legalSource,
    path: ["dpa"],
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
  [CONTENT_DYNAMIC_ROUTES.blogPost.route]: {
    source: blogPostsSource,
    path: [":slug"],
  },
  "/compare": {
    source: compareSource,
    path: ["compare"],
  },
  [CONTENT_DYNAMIC_ROUTES.comparison.route]: {
    source: comparePagesSource,
    path: [":competitor"],
  },
  "/for": {
    source: forSource,
    path: ["for"],
  },
  [CONTENT_DYNAMIC_ROUTES.industry.route]: {
    source: forPagesSource,
    path: [":industry"],
  },
  [CONTENT_DYNAMIC_ROUTES.feature.route]: {
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
  [CONTENT_DYNAMIC_ROUTES.doc.route]: {
    source: docsSource,
    path: [":slug"],
  },
} satisfies Record<(typeof PUBLIC_ROUTES_SEO)[number], { source: unknown; path: string[] }>;

export const NON_SEO_CONTENT_ROUTE_SOURCE_MAP = {
  "/docs/openapi": {
    source: apiOverviewSource,
    path: ["openapi"],
  },
  [CONTENT_DYNAMIC_ROUTES.openApiDoc.route]: {
    source: apiDocsSource,
    path: [":slug"],
  },
} as const;

export const CONTENT_ROUTE_SOURCE_MAP = {
  ...ROUTE_SOURCE_MAP,
  ...NON_SEO_CONTENT_ROUTE_SOURCE_MAP,
};
