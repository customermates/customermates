import { BASE_URL } from "@/constants/env";

const ORGANIZATION_NAME = "Customermates";
const ORGANIZATION_LOGO = `${BASE_URL}/customermates.svg`;
const ORGANIZATION_SAME_AS = [
  "https://github.com/customermates/customermates",
  "https://www.linkedin.com/company/customermates/",
  "https://x.com/benjiwagn",
];
const FOUNDER_NAME = "Benjamin Wagner";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORGANIZATION_NAME,
    url: BASE_URL,
    logo: ORGANIZATION_LOGO,
    sameAs: ORGANIZATION_SAME_AS,
  };
}

export function softwareApplicationSchema(params: { description: string; locale: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: ORGANIZATION_NAME,
    url: `${BASE_URL}/${params.locale}`,
    description: params.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, macOS, Windows, Linux",
    offers: {
      "@type": "Offer",
      price: "9",
      priceCurrency: "EUR",
      url: `${BASE_URL}/${params.locale}/pricing`,
    },
    publisher: {
      "@type": "Organization",
      name: ORGANIZATION_NAME,
      url: BASE_URL,
    },
  };
}

export function articleSchema(params: {
  authorName?: string;
  datePublished: string;
  dateModified?: string;
  description: string;
  headline: string;
  locale: string;
  slug: string;
}) {
  const url = `${BASE_URL}/${params.locale}/blog/${params.slug}`;
  const heroImage = `${BASE_URL}/images/light/${params.locale}/${params.slug}.png`;
  const ogImageParams = new URLSearchParams({ title: params.headline, description: params.description });
  const ogImage = `${BASE_URL}/og/image.png?${ogImageParams.toString()}`;
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
      item: `${BASE_URL}${crumb.path}`,
    })),
  };
}
