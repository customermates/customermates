import type { Metadata } from "next";

import { hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { RootDocument } from "@/app/root-document";
import { PublicAdAttributionConsentCard } from "@/components/acquisition/public-ad-attribution-consent";
import { env } from "@/env";
import { ROUTING_LOCALES, isContentLocale } from "@/i18n/locale-registry";
import { routing } from "@/i18n/routing";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return ROUTING_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  if (isContentLocale(locale)) return {};

  return { robots: { index: false, follow: true } };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <RootDocument displayLanguage={locale} messages={messages}>
      {children}

      {env.APP_MODE === "cloud" && isContentLocale(locale) ? <PublicAdAttributionConsentCard /> : null}
    </RootDocument>
  );
}
