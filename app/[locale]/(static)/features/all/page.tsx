import type { Metadata } from "next";

import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { featurePagesSource, featuresAllSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/features/all" });
}

function imageIfExists(slug: string, locale: string): string | undefined {
  const candidate = path.join(process.cwd(), "public", "images", "light", locale, `${slug}.png`);
  return existsSync(candidate) ? `${slug}.png` : undefined;
}

function lastModifiedISO(filePath: string): string | undefined {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return undefined;
  }
}

export default async function FeaturesAllHubPage() {
  const locale = await getLocale();
  const page = featuresAllSource.getPage(["all"], locale);

  if (!page) notFound();

  const tagLabel = locale === "de" ? "Funktion" : "Feature";

  const items: HubPostGridItem[] = featurePagesSource
    .getPages(locale)
    .map((p): HubPostGridItem | null => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;

      const filePath = path.join(process.cwd(), "content", "feature-pages", locale, `${slug}.mdx`);

      return {
        date: lastModifiedISO(filePath),
        description: p.data.description,
        href: `/features/${slug}`,
        imageSrc: imageIfExists(slug, locale),
        tag: tagLabel,
        title: p.data.featureName,
      };
    })
    .filter((item): item is HubPostGridItem => item !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Features", path: `/${locale}/features` },
          { name: "All Features", path: `/${locale}/features/all` },
        ])}
      />

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <Footer />
    </div>
  );
}
