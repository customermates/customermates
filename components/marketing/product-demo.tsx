"use client";

import type { ComponentPropsWithoutRef } from "react";

import { useLocale } from "next-intl";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { buildLocalePath, isRoutingLocale, type RoutingLocale } from "@/i18n/locale-registry";
import { cn } from "@/core/utils/cn";

const PRODUCT_DEMO_ORIGIN = "https://demo.customermates.com";

export const PRODUCT_DEMO_ROUTES = {
  deals: "/deals",
  inbox: "/inbox",
} as const;

export type ProductDemoSurface = keyof typeof PRODUCT_DEMO_ROUTES;

export const PRODUCT_DEMO_SELECTIONS = {
  "sophie-wagner": {
    surface: "inbox",
    threadId: "17000000-0000-4000-8000-000000000006",
  },
} as const;

export type ProductDemoSelection = keyof typeof PRODUCT_DEMO_SELECTIONS;

type SharedProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  title: string;
};

type Props = SharedProps &
  (
    | { selection?: ProductDemoSelection; surface: "inbox" }
    | { selection?: never; surface: Exclude<ProductDemoSurface, "inbox"> }
  );

export function resolveProductDemoUrl(
  locale: RoutingLocale,
  surface: ProductDemoSurface,
  selection?: ProductDemoSelection,
): string {
  const route = PRODUCT_DEMO_ROUTES[surface];
  if (!route) throw new Error(`Unsupported product demo surface: ${surface}`);

  const url = new URL(buildLocalePath(locale, route), PRODUCT_DEMO_ORIGIN);

  if (selection) {
    const selectedState = PRODUCT_DEMO_SELECTIONS[selection];
    if (!selectedState || selectedState.surface !== surface)
      throw new Error(`Unsupported product demo selection: ${selection} for ${surface}`);

    url.searchParams.set("threadId", selectedState.threadId);
  }

  return url.toString();
}

export function ProductDemo({ className, selection, surface, title, ...props }: Props) {
  const locale = useLocale();
  if (!isRoutingLocale(locale)) throw new Error(`Unsupported product demo locale: ${locale}`);
  const src = resolveProductDemoUrl(locale, surface, selection);

  return (
    <div {...props} className={cn("not-prose my-10 w-full scroll-mt-28", className)} data-product-demo={surface}>
      <BrowserFrame src={src} title={title} />
    </div>
  );
}
