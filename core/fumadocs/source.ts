import { loader } from "fumadocs-core/source";
import { defineI18n } from "fumadocs-core/i18n";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/routing";
import {
  apiDocs,
  apiOverview,
  affiliate,
  auth,
  automation,
  blog,
  blogPosts,
  compare,
  docs,
  features,
  helpAndFeedback,
  homepage,
  legal,
  pricing,
  skills,
  skillsOverview,
} from "@/.source/server";

export const i18n = defineI18n({
  defaultLanguage: ROUTING_DEFAULT_LOCALE,
  languages: ROUTING_LOCALES as unknown as string[],
  parser: "dir",
});

export const blogSource = loader({
  baseUrl: "/blog",
  i18n,
  source: toFumadocsSource(blog, []),
});

export const blogPostsSource = loader({
  baseUrl: "/blog",
  i18n,
  source: toFumadocsSource(blogPosts, []),
});

export const legalSource = loader({
  baseUrl: "",
  i18n,
  source: toFumadocsSource(legal, []),
});

export const docsSource = loader({
  baseUrl: "/docs",
  i18n,
  source: toFumadocsSource(docs, []),
});

export const apiDocsSource = loader({
  baseUrl: "/docs/openapi",
  i18n,
  source: toFumadocsSource(apiDocs, []),
});

export const apiOverviewSource = loader({
  baseUrl: "/docs/openapi",
  i18n,
  source: toFumadocsSource(apiOverview, []),
});

export const compareSource = loader({
  baseUrl: "/compare",
  i18n,
  source: toFumadocsSource(compare, []),
});

export const pricingSource = loader({
  baseUrl: "/pricing",
  i18n,
  source: toFumadocsSource(pricing, []),
});

export const featuresSource = loader({
  baseUrl: "/features",
  i18n,
  source: toFumadocsSource(features, []),
});

export const helpAndFeedbackSource = loader({
  baseUrl: "/help-and-feedback",
  i18n,
  source: toFumadocsSource(helpAndFeedback, []),
});

export const homepageSource = loader({
  baseUrl: "",
  i18n,
  source: toFumadocsSource(homepage, []),
});

export const automationSource = loader({
  baseUrl: "/n8n-crm",
  i18n,
  source: toFumadocsSource(automation, []),
});

export const authSource = loader({
  baseUrl: "/auth",
  i18n,
  source: toFumadocsSource(auth, []),
});

export const affiliateSource = loader({
  baseUrl: "/affiliate",
  i18n,
  source: toFumadocsSource(affiliate, []),
});

export const skillsSource = loader({
  baseUrl: "/docs/skills",
  i18n,
  source: toFumadocsSource(skills, []),
});

export const skillsOverviewSource = loader({
  baseUrl: "/docs/skills",
  i18n,
  source: toFumadocsSource(skillsOverview, []),
});
