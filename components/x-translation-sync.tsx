"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";

export function XTranslationSync() {
  const locale = useLocale();
  const t = useTranslations("");
  const { localeStore } = useRootStore();

  useEffect(() => {
    if (locale === "en" || locale === "de") localeStore.setLocale(locale);
    localeStore.setTranslation(t);
  }, [locale, t]);

  return null;
}
