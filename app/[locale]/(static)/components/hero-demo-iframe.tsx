"use client";

import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { BrowserFrame } from "@/components/marketing/browser-frame";

export function HeroDemoIframe() {
  const locale = useLocale();
  const t = useTranslations();
  const src = `https://demo.customermates.com/${locale}`;
  const showLocalFallback = process.env.NODE_ENV === "development";

  return (
    <div className="relative mx-auto mt-2 w-full max-w-[1400px]">
      <BrowserFrame src={src} title={t("BrowserFrame.liveDemoTitle")} />

      {showLocalFallback ? (
        <div className="absolute inset-x-px top-[35px] bottom-px flex flex-col items-center justify-center gap-6 rounded-b-[13px] bg-card px-6 text-center">
          <p className="max-w-lg text-[clamp(1.75rem,4vw,3.5rem)] font-medium leading-tight tracking-[-0.035em] text-balance">
            {t("BrowserFrame.liveDemoTitle")}
          </p>

          <a
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
            href={src}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t("BrowserFrame.open")}

            <ArrowUpRight className="size-4" />
          </a>
        </div>
      ) : null}
    </div>
  );
}
