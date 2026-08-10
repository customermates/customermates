import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource, compareSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";
import { contentLocaleOrDefault, formattingTagFor } from "@/i18n/locale-registry";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/compare" });
}

export default async function CompareHubPage() {
  const locale = contentLocaleOrDefault(await getLocale());
  const page = compareSource.getPage(["compare"], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const collator = new Intl.Collator(formattingTagFor(locale));
  const tagLabels = {
    alternative: t("ComparePage.tags.alternative"),
    comparison: t("ComparePage.tags.comparison"),
    review: t("ComparePage.tags.review"),
  };

  const items: HubPostGridItem[] = comparePagesSource
    .getPages(locale)
    .map((p): HubPostGridItem | null => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;

      const competitor2 = p.data.comparison?.competitor2Name;
      let title = p.data.competitorName;
      if (slug.includes("-vs-") && competitor2) title = `${p.data.competitorName} vs ${competitor2}`;
      else if (slug.endsWith("-alternative")) {
        title = t("ComparePage.alternativeTitle", {
          competitor: p.data.competitorName,
        });
      }

      return {
        description: p.data.description,
        href: `/compare/${slug}`,
        imageSrc: `${slug}.png`,
        tag: slug.endsWith("-alternative")
          ? tagLabels.alternative
          : slug.includes("-vs-")
            ? tagLabels.comparison
            : tagLabels.review,
        title,
      };
    })
    .filter((item): item is HubPostGridItem => item !== null)
    .sort((a, b) => collator.compare(a.title, b.title));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          {
            name: t("StructuredData.breadcrumb.compare"),
            path: `/${locale}/compare`,
          },
        ])}
      />

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <Footer />
    </div>
  );
}
