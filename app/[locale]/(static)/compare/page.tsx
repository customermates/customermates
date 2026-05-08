import type { Metadata } from "next";

import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Footer } from "@/app/components/footer";
import { HubPostGrid, type HubPostGridItem } from "@/components/marketing/hub-post-grid";
import { JsonLd } from "@/components/seo/json-ld";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { comparePagesSource, compareSource } from "@/core/fumadocs/source";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/compare" });
}

function tagForCompareSlug(slug: string): string {
  if (slug.endsWith("-alternative")) return "Alternative";
  if (slug.includes("-vs-")) return "Comparison";
  return "Review";
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

export default async function CompareHubPage() {
  const locale = await getLocale();
  const page = compareSource.getPage(["compare"], locale);

  if (!page) notFound();

  const items: HubPostGridItem[] = comparePagesSource
    .getPages(locale)
    .map((p): HubPostGridItem | null => {
      const slug = p.url?.split("/").pop() ?? "";
      if (!slug) return null;

      const competitor2 = p.data.comparison?.competitor2Name;
      let title = p.data.competitorName;
      if (slug.includes("-vs-") && competitor2) title = `${p.data.competitorName} vs ${competitor2}`;
      else if (slug.endsWith("-alternative")) title = `${p.data.competitorName} alternative`;

      const filePath = path.join(process.cwd(), "content", "compare-pages", locale, `${slug}.mdx`);

      return {
        date: lastModifiedISO(filePath),
        description: p.data.description,
        href: `/compare/${slug}`,
        imageSrc: imageIfExists(slug, locale),
        tag: tagForCompareSlug(slug),
        title,
      };
    })
    .filter((item): item is HubPostGridItem => item !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col items-center justify-center">
      <JsonLd
        schema={breadcrumbListSchema([
          { name: "Home", path: `/${locale}` },
          { name: "Compare", path: `/${locale}/compare` },
        ])}
      />

      <HubPostGrid hero={page.data.hero} items={items} locale={locale} />

      <Footer />
    </div>
  );
}
