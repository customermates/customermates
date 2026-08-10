"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

import { appLocaleCookieUpdate, appLocaleReconciliationTarget, browserAppLocale } from "@/i18n/locale-preference";
import { usePathname } from "@/i18n/navigation";
import { isContentPathname } from "@/i18n/routing";

type Props = {
  displayLanguage: unknown;
};

export function AppLocalePreferenceSync({ displayLanguage }: Props) {
  const currentLocale = useLocale();
  const pathname = usePathname();

  useEffect(() => {
    if (isContentPathname(pathname)) return;

    const update = appLocaleCookieUpdate(displayLanguage, document.cookie);
    if (update) document.cookie = update;

    const target = appLocaleReconciliationTarget(
      displayLanguage,
      currentLocale,
      pathname,
      browserAppLocale(navigator.languages),
    );
    if (target) {
      const targetUrl = new URL(window.location.href);
      targetUrl.pathname = target;
      window.location.replace(targetUrl);
    }
  }, [currentLocale, displayLanguage, pathname]);

  return null;
}
