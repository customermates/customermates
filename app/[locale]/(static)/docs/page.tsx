import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { DocsPageHeader } from "./components/docs-page-header";

import { Footer } from "@/app/components/footer";
import { DocsDemo } from "@/core/fumadocs/docs-demo";
import { docsSource } from "@/core/fumadocs/source";
import { getMDXComponents } from "@/core/fumadocs/mdx-components";
import { generateMetadataFromMeta } from "@/core/fumadocs/metadata";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";
import { XTOC } from "@/components/x-toc";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return generateMetadataFromMeta({ locale, route: "/docs" });
}

export default async function DocsOverviewPage() {
  const locale = await getLocale();
  const page = docsSource.getPage(["intro-page"], locale);

  if (!page) notFound();

  const MDX = page.data.body;
  const components = getMDXComponents();
  const markdownUrl = `/${locale}/raw/docs/intro-page.md`;

  return (
    <XPageContainer>
      <DocsPageHeader description={page.data.description} markdownUrl={markdownUrl} title={page.data.title} />

      {page.data.demo && <DocsDemo src={page.data.demo.src} title={page.data.demo.title} />}

      <XTOC items={page.data.toc}>
        <div className="min-w-0 overflow-x-hidden prose prose-sm prose-neutral dark:prose-invert max-w-none [&_.fd-codeblock]:mx-0 [&_.fd-codeblock]:w-full [&_pre]:mx-0 [&_pre]:w-full">
          <MDX components={components} />
        </div>
      </XTOC>

      <div className="-mx-4 -mb-4 mt-auto pt-4 md:-mx-6 md:-mb-6 md:pt-6">
        <Footer />
      </div>
    </XPageContainer>
  );
}
