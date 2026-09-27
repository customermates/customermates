import type { Metadata } from "next";

import {
  generateCompareHubMetadata,
  renderCompareHub,
  compareHubPageCount,
  compareHubPageFromSegment,
} from "../../compare-hub";

import { hubPageStaticParams } from "@/core/seo/hub-pagination";
import { isContentLocale } from "@/i18n/locale-registry";
import { enableStaticLocale } from "@/i18n/static-locale";

type Props = {
  params: Promise<{ locale: string; page: string }>;
};

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return isContentLocale(params.locale) ? hubPageStaticParams(compareHubPageCount()) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  return generateCompareHubMetadata(locale, compareHubPageFromSegment(page));
}

export default async function CompareHubPaginatedPage({ params }: Props) {
  const locale = await enableStaticLocale(params);
  const { page } = await params;
  return renderCompareHub(locale, compareHubPageFromSegment(page));
}
