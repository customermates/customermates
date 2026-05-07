import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubGrid, type HubGridItem } from "@/components/marketing/hub-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource, compareSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/compare" });
}

export default async function CompareHubPage() {
  const locale = await getLocale();
  const page = compareSource.getPage(["compare"], locale);

  if (!page) notFound();

  const items: HubGridItem[] = comparePagesSource
    .getPages(locale)
    .map((p) => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;
      const competitor2 = p.data.comparison?.competitor2Name;
      let name = p.data.competitorName;
      if (slug.includes("-vs-") && competitor2) name = `${p.data.competitorName} vs ${competitor2}`;
      else if (slug.endsWith("-alternative")) name = `${p.data.competitorName} alternative`;
      return {
        description: p.data.description,
        href: `/compare/${slug}`,
        name,
      };
    })
    .filter((item): item is HubGridItem => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Compare", path: `/${locale}/compare` },
        ])}
      />

      <HubGrid hero={page.data.hero} items={items} />

      <Footer />
    </div>
  );
}
