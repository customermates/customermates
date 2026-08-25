import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { DocsPageActions } from "../components/docs-page-actions";
import { DocsPageHeader } from "../components/docs-page-header";

import { env } from "@/env";
import { DocsDemo } from "@/core/fumadocs/docs-demo";
import { docsSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { docNavI18nKey } from "@/features/docs/docs-nav";
import { PageContainer } from "@/components/shared/page-container";
import { Toc } from "@/components/shared/toc";
import { Footer } from "@/app/components/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbListSchema } from "@/core/seo/schemas";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return generateMetadataFromMeta({ locale, route: "/docs/:slug", params: { slug } });
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const page = docsSource.getPage([slug], locale);

  if (!page) notFound();

  const t = await getTranslations();
  const navKey = docNavI18nKey(slug);
  const headline = navKey ? t(navKey) : page.data.title;

  const MDX = page.data.body;
  const components = getMDXComponents();
  const markdownUrl = `/${locale}/raw/docs/${slug}.md`;
  const mcpUrl = `${env.BASE_URL}/api/v1/mcp`;

  return (
    <>
      <JsonLd
        schema={breadcrumbListSchema([
          { name: t("StructuredData.breadcrumb.home"), path: `/${locale}` },
          { name: t("StructuredData.breadcrumb.docs"), path: `/${locale}/docs` },
          { name: headline, path: `/${locale}/docs/${slug}` },
        ])}
      />

      <PageContainer>
        <DocsPageHeader
          description={page.data.description}
          markdownUrl={markdownUrl}
          mcpUrl={mcpUrl}
          title={headline}
        />

        {page.data.demo && <DocsDemo src={page.data.demo.src} title={page.data.demo.title} />}

        <Toc actions={<DocsPageActions markdownUrl={markdownUrl} mcpUrl={mcpUrl} />} items={page.data.toc}>
          <div className="min-w-0 overflow-x-clip [--table-sticky-top:-1rem] md:[--table-sticky-top:-1.5rem] prose prose-sm prose-neutral dark:prose-invert max-w-none [&_.fd-codeblock]:mx-0 [&_.fd-codeblock]:w-full [&_pre]:mx-0 [&_pre]:w-full">
            <MDX components={components} />
          </div>
        </Toc>

        <Footer className="-mx-4 -mb-4 w-auto md:-mx-6 md:-mb-6" />
      </PageContainer>
    </>
  );
}
