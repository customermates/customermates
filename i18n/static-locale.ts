import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { isContentLocale, isMarketingLocale, isMarketingPathPublished } from "./locale-registry";

export async function enableStaticLocale(params: Promise<{ locale: string }>): Promise<string> {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!isContentLocale(locale)) notFound();
  return locale;
}

export async function enableMarketingShellLocale(params: Promise<{ locale: string }>): Promise<string> {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!isMarketingLocale(locale)) notFound();
  return locale;
}

export async function enableMarketingLocale(params: Promise<{ locale: string }>, routePath: string): Promise<string> {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!isMarketingPathPublished(locale, routePath)) notFound();
  return locale;
}

export type StaticLocaleProps = {
  params: Promise<{ locale: string }>;
};
