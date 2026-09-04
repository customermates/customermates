import type { Metadata } from "next";

import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { PublicAdAttributionConsentCard } from "@/components/acquisition/public-ad-attribution-consent";
import { env } from "@/env";
import { isContentLocale } from "@/i18n/locale-registry";
import { routing } from "@/i18n/routing";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  if (isContentLocale(locale)) return {};

  return { robots: { index: false, follow: true } };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <>
      {children}

      {env.APP_MODE === "cloud" && isContentLocale(locale) ? <PublicAdAttributionConsentCard /> : null}
    </>
  );
}
