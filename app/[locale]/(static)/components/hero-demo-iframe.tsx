"use client";

import { useLocale, useTranslations } from "next-intl";

import { BrowserFrame } from "@/components/marketing/browser-frame";
import { cn } from "@/core/utils/cn";

type Props = {
  className?: string;
  size?: "article" | "full";
  src?: string;
};

export function HeroDemoIframe({ className, size = "full", src }: Props) {
  const locale = useLocale();
  const t = useTranslations();
  const demoSrc = src ?? `https://demo.customermates.com/${locale}/dashboard?agentChat=open`;

  return (
    <div className={cn("mx-auto w-full", className)}>
      <BrowserFrame size={size} src={demoSrc} title={t("BrowserFrame.liveDemoTitle")} />
    </div>
  );
}
