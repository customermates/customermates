import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { forPagesSource, forSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/for" });
}

export default async function ForHubPage() {
  const locale = await getLocale();
  const page = forSource.getPage(["for"], locale);

  if (!page) notFound();

  const tagLabel = locale === "de" ? "Branche" : "Industry";

  const items: HubPostGridItem[] = forPagesSource
    .getPages(locale)
    .map((p): HubPostGridItem | null => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;

      return {
        description: p.data.description,
        href: `/for/${slug}`,
        imageSrc: `${slug}.png`,
        tag: tagLabel,
        title: p.data.industryName,
      };
    })
    .filter((item): item is HubPostGridItem => item !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Industries", path: `/${locale}/for` },
        ])}
      />

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <Footer />
    </div>
  );
}
