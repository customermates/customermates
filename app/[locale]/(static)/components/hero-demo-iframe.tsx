"use client";

import { useLocale, useTranslations } from "next-intl";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { cn } from "@/core/utils/cn";

export function HeroDemoIframe({ className, src }: { className?: string; src?: string }) {
  const locale = useLocale();
  const t = useTranslations();
  const demoSrc = src ?? `https://demo.customermates.com/${locale}/dashboard?agentChat=open`;

  return (
    <div className={cn("mx-auto w-full", className)}>
      <BrowserFrame src={demoSrc} title={t("BrowserFrame.liveDemoTitle")} />
    </div>
  );
}
