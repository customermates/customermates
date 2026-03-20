import { getLocale } from "next-intl/server";

import { FooterContent } from "./footer-content";

import { compareSource } from "@/core/fumadocs/source";

export async function Footer() {
  const locale = await getLocale();
  const pages = compareSource.getPages(locale);

  const competitors = pages
    .map((page) => {
      const url = page.url;
      const displayName = page.data.competitorName;

      if (!url || !displayName) return null;

      const slug = url.split("/").pop() || "";

      return { slug, displayName };
    })
    .filter((competitor): competitor is { slug: string; displayName: string } => competitor !== null);

  return <FooterContent competitors={competitors} />;
}
