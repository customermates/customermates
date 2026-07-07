import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { DocsPageActions } from "../components/docs-page-actions";
import { DocsPageHeader } from "../components/docs-page-header";

import { env } from "@/env";
import { DocsDemo } from "@/core/fumadocs/docs-demo";
import { docsSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { PageContainer } from "@/components/shared/page-container";
import { Toc } from "@/components/shared/toc";

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

  const MDX = page.data.body;
  const components = getMDXComponents();
  const markdownUrl = `/${locale}/raw/docs/${slug}.md`;
  const mcpUrl = `${env.BASE_URL}/api/v1/mcp`;

  return (
    <PageContainer>
      <DocsPageHeader
        description={page.data.description}
        markdownUrl={markdownUrl}
        mcpUrl={mcpUrl}
        title={page.data.title}
      />

      {page.data.demo && <DocsDemo src={page.data.demo.src} title={page.data.demo.title} />}

      <Toc actions={<DocsPageActions markdownUrl={markdownUrl} mcpUrl={mcpUrl} />} items={page.data.toc}>
        <div className="min-w-0 overflow-hidden prose prose-sm prose-neutral dark:prose-invert max-w-none [&_.fd-codeblock]:mx-0 [&_.fd-codeblock]:w-full [&_pre]:mx-0 [&_pre]:w-full">
          <MDX components={components} />
        </div>
      </Toc>
    </PageContainer>
  );
}
