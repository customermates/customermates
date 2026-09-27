import type { Metadata } from "next";

import { generateForHubMetadata, renderForHub, forHubPageCount, forHubPageFromSegment } from "../../for-hub";

import { hubPageStaticParams } from "@/core/seo/hub-pagination";
import { isContentLocale } from "@/i18n/locale-registry";
import { enableStaticLocale } from "@/i18n/static-locale";

type Props = {
  params: Promise<{ locale: string; page: string }>;
};

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return isContentLocale(params.locale) ? hubPageStaticParams(forHubPageCount()) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  return generateForHubMetadata(locale, forHubPageFromSegment(page));
}

export default async function ForHubPaginatedPage({ params }: Props) {
  const locale = await enableStaticLocale(params);
  const { page } = await params;
  return renderForHub(locale, forHubPageFromSegment(page));
}
