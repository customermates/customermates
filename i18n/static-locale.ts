import { setRequestLocale } from "next-intl/server";

export async function enableStaticLocale(params: Promise<{ locale: string }>): Promise<string> {
  const { locale } = await params;
  setRequestLocale(locale);
  return locale;
}

export type StaticLocaleProps = {
  params: Promise<{ locale: string }>;
};
