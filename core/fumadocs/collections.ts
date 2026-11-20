import { i18n, marketingI18n } from "./i18n";

export const COLLECTION_LOADERS = {
  about: { baseUrl: "/about", i18n },
  affiliate: { baseUrl: "/affiliate", i18n },
  apiDocs: { baseUrl: "/docs/openapi", i18n },
  apiOverview: { baseUrl: "/docs/openapi", i18n },
  auth: { baseUrl: "/auth", i18n },
  automation: { baseUrl: "/n8n-crm", i18n },
  blog: { baseUrl: "/blog", i18n },
  blogPosts: { baseUrl: "/blog", i18n },
  compare: { baseUrl: "/compare", i18n },
  comparePages: { baseUrl: "/compare", i18n },
  contact: { baseUrl: "/contact", i18n },
  docs: { baseUrl: "/docs", i18n },
  featurePages: { baseUrl: "/features", i18n: marketingI18n },
  features: { baseUrl: "/features", i18n },
  featuresAll: { baseUrl: "/features", i18n },
  forHub: { baseUrl: "/for", i18n: marketingI18n },
  forPages: { baseUrl: "/for", i18n: marketingI18n },
  helpAndFeedback: { baseUrl: "/help-and-feedback", i18n },
  homepage: { baseUrl: "", i18n: marketingI18n },
  legal: { baseUrl: "", i18n },
  pricing: { baseUrl: "/pricing", i18n: marketingI18n },
} as const;

export type CollectionName = keyof typeof COLLECTION_LOADERS;
