import { getLocale } from "next-intl/server";

import { FooterContent } from "./footer-content";

import { blogPostsSource, comparePagesSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";

const FOOTER_COMPARE = new Set([
  "gohighlevel",
  "notion-alternative",
  "hubspot-vs-salesforce",
  "vtiger-alternative",
  "folk",
  "cobra-alternative",
]);

const FOOTER_FOR = new Set([
  "healthcare",
  "ecommerce",
  "recruiting",
  "construction",
  "manufacturing",
  "property-management",
]);

const FOOTER_FEATURES = new Set([
  "cloud-crm",
  "sales-tracking",
  "lead-management",
  "sales-automation",
  "contact-management",
  "reporting",
]);

const FOOTER_BLOG_POSTS = new Set([
  "customer-interaction-management",
  "customer-retention-management",
  "crm-examples",
  "customer-communication-management",
  "crm-software",
  "agentic-ai",
]);

export async function Footer() {
  const locale = await getLocale();

  const competitors = comparePagesSource
    .getPages(locale)
    .map((page) => {
      const slug = page.url?.split("/").pop() || "";
      if (!FOOTER_COMPARE.has(slug)) return null;
      const competitor2 = page.data.comparison?.competitor2Name;
      let displayName = page.data.competitorName;
      if (slug.includes("-vs-") && competitor2) displayName = `${page.data.competitorName} vs ${competitor2}`;
      else if (slug.endsWith("-alternative")) displayName = `${page.data.competitorName} alternative`;
      return { slug, displayName };
    })
    .filter((item): item is { slug: string; displayName: string } => item !== null);

  const industries = forPagesSource
    .getPages(locale)
    .map((page) => {
      const slug = page.url?.split("/").pop() || "";
      if (!FOOTER_FOR.has(slug)) return null;
      return { slug, displayName: page.data.industryName };
    })
    .filter((item): item is { slug: string; displayName: string } => item !== null);

  const featureLinks = featurePagesSource
    .getPages(locale)
    .map((page) => {
      const slug = page.url?.split("/").pop() || "";
      if (!FOOTER_FEATURES.has(slug)) return null;
      return { slug, displayName: page.data.featureName };
    })
    .filter((item): item is { slug: string; displayName: string } => item !== null);

  const blogPosts = blogPostsSource
    .getPages(locale)
    .map((page) => {
      const slug = page.url?.split("/").pop() || "";
      if (!FOOTER_BLOG_POSTS.has(slug)) return null;
      return { slug, displayName: page.data.hero.title };
    })
    .filter((item): item is { slug: string; displayName: string } => item !== null);

  return (
    <FooterContent
      blogPosts={blogPosts}
      competitors={competitors}
      featureLinks={featureLinks}
      industries={industries}
    />
  );
}
