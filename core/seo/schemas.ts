import { env } from "@/env";

const ORGANIZATION_NAME = "Customermates";
const ORGANIZATION_LOGO = `${env.BASE_URL}/customermates.svg`;
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

export function softwareApplicationSchema(params: { description: string; locale: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: ORGANIZATION_NAME,
    url: `${env.BASE_URL}/${params.locale}`,
    description: params.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, macOS, Windows, Linux",
    offers: {
      "@type": "Offer",
      price: "7",
      priceCurrency: "EUR",
      url: `${env.BASE_URL}/${params.locale}/pricing`,
    },
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
  const ogImageParams = new URLSearchParams({ title: params.headline, description: params.description });
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
