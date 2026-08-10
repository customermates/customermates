"use client";

import { useLocale, useTranslations } from "next-intl";

import { BrowserFrame } from "@/components/marketing/browser-frame";

export function HeroDemoIframe() {
  const locale = useLocale();
  const t = useTranslations();

  return (
    <div className="mt-2 max-w-[1400px] mx-auto w-full">
      <BrowserFrame src={`https://demo.customermates.com/${locale}`} title={t("BrowserFrame.liveDemoTitle")} />
    </div>
  );
}
