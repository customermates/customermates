import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubGrid, type HubGridItem } from "@/components/marketing/hub-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource, featuresAllSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/features/all" });
}

export default async function FeaturesAllHubPage() {
  const locale = await getLocale();
  const page = featuresAllSource.getPage(["all"], locale);

  if (!page) notFound();

  const items: HubGridItem[] = featurePagesSource
    .getPages(locale)
    .map((p) => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;
      return {
        description: p.data.description,
        href: `/features/${slug}`,
        name: p.data.featureName,
      };
    })
    .filter((item): item is HubGridItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Features", path: `/${locale}/features` },
          { name: "All Features", path: `/${locale}/features/all` },
        ])}
      />

      <HubGrid hero={page.data.hero} items={items} />

      <Footer />
    </div>
  );
}
