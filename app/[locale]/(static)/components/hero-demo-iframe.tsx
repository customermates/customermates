"use client";

import dynamic from "next/dynamic";
import { useLocale } from "next-intl";

const BrowserFrame = dynamic(
  () => import("@/components/marketing/browser-frame").then((m) => ({ default: m.BrowserFrame })),
  {
    ssr: false,
    loading: () => (
      <div className="relative mx-auto w-full shadow-[0_22px_48px_-14px_rgba(0,0,0,0.22)]">
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="h-[34px] border-b border-border bg-muted/50" />

          <div className="h-[600px] md:h-[700px] lg:h-[750px] animate-pulse bg-muted" />
        </div>
      </div>
    ),
  },
);

export function HeroDemoIframe() {
  const locale = useLocale();

  return (
    <div className="mt-2 max-w-[1400px] mx-auto w-full">
      <BrowserFrame src={`https://demo.customermates.com/${locale}`} title="Customermates live demo" />
    </div>
  );
}
