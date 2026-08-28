"use client";

import { useLocale } from "next-intl";

import { BrowserFrame } from "./browser-frame";
import { type ContentLocale, contentLocaleOrDefault } from "@/i18n/locale-registry";

export const PRODUCT_DEMO_PATHS = ["/dashboard", "/inbox", "/deals"] as const;

export type ProductDemoPath = (typeof PRODUCT_DEMO_PATHS)[number];

type DemoCopy = {
  eyebrow: string;
  standardDisclosure: string;
  hostedDisclosure: string;
  titles: Record<ProductDemoPath, string>;
};

const COPY = {
  en: {
    eyebrow: "Explore the product",
    standardDisclosure:
      "Public, seeded product demo. It uses synthetic sample data; no customer account or customer data is shown.",
    hostedDisclosure:
      "Public, seeded demo of hosted Customermates. It uses synthetic sample data; no customer account or customer data is shown. This illustrates the managed product UI, not a self-hosted deployment.",
    titles: {
      "/dashboard": "Customermates dashboard with synthetic sample data",
      "/deals": "Customermates deal pipeline with synthetic sample data",
      "/inbox": "Customermates unified inbox with synthetic sample data",
    },
  },
  de: {
    eyebrow: "Produkt kennenlernen",
    standardDisclosure:
      "Öffentliche, vorbefüllte Produktdemo mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt.",
    hostedDisclosure:
      "Öffentliche, vorbefüllte Demo der gehosteten Customermates-Version mit synthetischen Beispieldaten. Es werden weder ein Kundenkonto noch Kundendaten angezeigt. Die Demo zeigt die Managed-Cloud-Oberfläche, kein Self-Hosted-Deployment.",
    titles: {
      "/dashboard": "Customermates-Dashboard mit synthetischen Beispieldaten",
      "/deals": "Customermates-Deal-Pipeline mit synthetischen Beispieldaten",
      "/inbox": "Einheitlicher Customermates-Posteingang mit synthetischen Beispieldaten",
    },
  },
} as const satisfies Record<ContentLocale, DemoCopy>;

function isProductDemoPath(path: string): path is ProductDemoPath {
  return PRODUCT_DEMO_PATHS.some((candidate) => candidate === path);
}

export function buildProductDemoUrl(locale: ContentLocale, path: string): string {
  if (!isProductDemoPath(path)) throw new Error(`Unsupported product demo path: ${path}`);

  return `https://demo.customermates.com/${locale}${path}`;
}

type Props = {
  hostedBoundary?: boolean;
  path: ProductDemoPath;
};

export function ProductDemo({ hostedBoundary = false, path }: Props) {
  const locale = contentLocaleOrDefault(useLocale());
  const copy = COPY[locale];
  const disclosure = hostedBoundary ? copy.hostedDisclosure : copy.standardDisclosure;

  return (
    <figure className="not-prose my-12" data-product-demo={path}>
      <figcaption className="mb-4 max-w-2xl space-y-2">
        <span className="text-eyebrow block">{copy.eyebrow}</span>

        <span className="block text-sm leading-6 text-muted-foreground">{disclosure}</span>
      </figcaption>

      <BrowserFrame size="article" src={buildProductDemoUrl(locale, path)} title={copy.titles[path]} />
    </figure>
  );
}
