import { getLocale } from "next-intl/server";

import { FooterContent } from "./footer-content";

import { comparePagesSource, featurePagesSource, forPagesSource } from "@/core/fumadocs/source";

// Top SEO opportunities per section (by optimization score from knowledge base)
const FOOTER_COMPARE = new Set([
  "hubspot-alternative",
  "pipedrive-alternative",
  "zoho-crm-alternative",
  "notion-alternative",
  "cobra-alternative",
  "vtiger-alternative",
]);

const FOOTER_FOR = new Set([
  "healthcare",
  "ecommerce",
  "property-management",
  "manufacturing",
  "marketing",
  "agencies",
]);

const FOOTER_FEATURES = new Set([
  "cloud-crm",
  "contact-management",
  "lead-management",
  "sales-automation",
  "workflow-automation",
  "self-hosted",
]);

export async function Footer() {
  const locale = await getLocale();

  const competitors = comparePagesSource
    .getPages(locale)
    .map((page) => {
      const slug = page.url?.split("/").pop() || "";
      if (!FOOTER_COMPARE.has(slug)) return null;
      return { slug, displayName: page.data.competitorName };
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

  return <FooterContent competitors={competitors} featureLinks={featureLinks} industries={industries} />;
}
