"use client";

import { useLocale } from "next-intl";

import { DocsDemo } from "@/core/fumadocs/docs-demo";

type Props = {
  withHorizontalPadding?: boolean;
};

export function HomepageDemo({ withHorizontalPadding = true }: Props) {
  const locale = useLocale();

  return (
    <DocsDemo
      src={`https://demo.customermates.com/${locale}`}
      title="Customermates Demo"
      withHorizontalPadding={withHorizontalPadding}
    />
  );
}
