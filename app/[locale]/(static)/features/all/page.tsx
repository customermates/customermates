import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource, featuresAllSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/features/all" });
}

export default async function FeaturesAllHubPage() {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = featuresAllSource.getPage(["all"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const tagLabel = t("Common.tags.feature");
  const collator = new Intl.Collator(formattingTagFor(locale));

  const items: HubPostGridItem[] = featurePagesSource
    .getPages(locale)
    .map((p): HubPostGridItem | null => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;

      return {
        description: p.data.description,
        href: `/features/${slug}`,
        imageSrc: `${slug}.png`,
        tag: tagLabel,
        title: p.data.featureName,
      };
    })
    .filter((item): item is HubPostGridItem => item !== null)
    .sort((a, b) => collator.compare(a.title, b.title));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          { name: t("StructuredData.breadcrumb.features"), path: `/${locale}/features` },
          { name: t("StructuredData.breadcrumb.allFeatures"), path: `/${locale}/features/all` },
        ])}
      />

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <Footer />
    </div>
  );
}
