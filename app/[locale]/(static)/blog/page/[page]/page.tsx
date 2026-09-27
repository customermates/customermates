import type { Metadata } from "next";

import { generateBlogHubMetadata, renderBlogHub, blogHubPageCount, blogHubPageFromSegment } from "../../blog-hub";

import { hubPageStaticParams } from "@/core/seo/hub-pagination";
import { isContentLocale } from "@/i18n/locale-registry";
import { enableStaticLocale } from "@/i18n/static-locale";

type Props = {
  params: Promise<{ locale: string; page: string }>;
};

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return isContentLocale(params.locale) ? hubPageStaticParams(blogHubPageCount()) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  return generateBlogHubMetadata(locale, blogHubPageFromSegment(page));
}

export default async function BlogHubPaginatedPage({ params }: Props) {
  const locale = await enableStaticLocale(params);
  const { page } = await params;
  return renderBlogHub(locale, blogHubPageFromSegment(page));
}
