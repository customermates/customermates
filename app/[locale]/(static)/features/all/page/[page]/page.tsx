import type { Metadata } from "next";

import {
  generateFeaturesAllHubMetadata,
  renderFeaturesAllHub,
  featuresAllHubPageCount,
  featuresAllHubPageFromSegment,
} from "../../features-all-hub";

import { hubPageStaticParams } from "@/core/seo/hub-pagination";
import { isContentLocale } from "@/i18n/locale-registry";
import { enableStaticLocale } from "@/i18n/static-locale";

type Props = {
  params: Promise<{ locale: string; page: string }>;
};

export function generateStaticParams({ params }: { params: { locale: string } }) {
  return isContentLocale(params.locale) ? hubPageStaticParams(featuresAllHubPageCount()) : [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  return generateFeaturesAllHubMetadata(locale, featuresAllHubPageFromSegment(page));
}

export default async function FeaturesAllHubPaginatedPage({ params }: Props) {
  const locale = await enableStaticLocale(params);
  const { page } = await params;
  return renderFeaturesAllHub(locale, featuresAllHubPageFromSegment(page));
}
