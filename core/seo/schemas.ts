import { env } from "@/env";
import { COMMERCIAL_OFFERS } from "@/core/commercial/plan-catalog";

const ORGANIZATION_NAME = "Customermates";
const ORGANIZATION_LOGO = `${env.BASE_URL}/images/light/customermates-square.svg`;
const ORGANIZATION_SAME_AS = [
  "https://github.com/customermates/customermates",
  "https://www.linkedin.com/company/customermates/",
  "https://x.com/benjiwagn",
];
const FOUNDER_NAME = "Benjamin Wagner";
const FOUNDER_URL = "https://www.linkedin.com/in/wagner-benjamin/";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORGANIZATION_NAME,
    url: env.BASE_URL,
    logo: ORGANIZATION_LOGO,
    sameAs: ORGANIZATION_SAME_AS,
  };
}

export function aggregateOfferSchema(params: { locale: string }) {
  const amounts = COMMERCIAL_OFFERS.map((offer) => offer.unitPriceMinor / 100);
  if (amounts.length === 0) return undefined;

  return {
    "@type": "AggregateOffer",
    lowPrice: String(Math.min(...amounts)),
    highPrice: String(Math.max(...amounts)),
    priceCurrency: COMMERCIAL_OFFERS[0].currency,
    offerCount: String(amounts.length),
    url: `${env.BASE_URL}/${params.locale}/pricing`,
  };
}

export function softwareApplicationSchema(params: { description: string; locale: string }) {
  const offers = aggregateOfferSchema({ locale: params.locale });

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: ORGANIZATION_NAME,
    url: `${env.BASE_URL}/${params.locale}`,
    description: params.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, macOS, Windows, Linux",
    ...(offers ? { offers } : {}),
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_NAME,
      url: env.BASE_URL,
    },
  };
}

export function articleSchema(params: {
  authorName?: string;
  authorUrl?: string;
  datePublished: string;
  dateModified?: string;
  description: string;
  headline: string;
  locale: string;
  slug: string;
}) {
  const url = `${env.BASE_URL}/${params.locale}/blog/${params.slug}`;
  const heroImage = `${env.BASE_URL}/images/light/${params.locale}/${params.slug}.png`;
  const ogImageParams = new URLSearchParams({
    title: params.headline,
    description: params.description,
  });
  const ogImage = `${env.BASE_URL}/og/image.png?${ogImageParams.toString()}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.headline,
    description: params.description,
    image: [heroImage, ogImage],
    datePublished: params.datePublished,
    dateModified: params.dateModified ?? params.datePublished,
    author: {
      "@type": "Person",
      name: params.authorName ?? FOUNDER_NAME,
      url: params.authorUrl ?? FOUNDER_URL,
    },
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_NAME,
      logo: {
        "@type": "ImageObject",
        url: ORGANIZATION_LOGO,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };
}

export function breadcrumbListSchema(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${env.BASE_URL}${crumb.path}`,
    })),
  };
}

export function faqPageSchema(entries: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}
