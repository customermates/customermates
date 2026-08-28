import type { HomepageProductProof } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { MousePointerClick } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HeroDemoIframe } from "./hero-demo-iframe";

export function HomepageLiveDemo({ locale, proof }: { locale: ContentLocale; proof: HomepageProductProof }) {
  const localBaseUrl = process.env.BASE_URL?.replace(/\/$/u, "");
  const demoPath = `/${locale}/dashboard`;
  const demoSrc =
    process.env.NODE_ENV === "development" && localBaseUrl
      ? `${localBaseUrl}${demoPath}`
      : `https://demo.customermates.com${demoPath}`;

  return (
    <MarketingSection containerClassName="scroll-mt-24" id="live-demo">
      <div className="marketing-grid items-end gap-y-6">
        <div className="col-span-12 lg:col-span-5">
          <p className="text-eyebrow flex items-center gap-2">
            <MousePointerClick aria-hidden className="size-3.5" />

            {proof.demoEyebrow}
          </p>

          <h2 className="text-display-sm mt-5">{proof.demoTitle}</h2>
        </div>

        <p className="col-span-12 text-sm leading-relaxed text-muted-foreground lg:col-start-7 lg:col-end-13">
          {proof.demoDescription}
        </p>

        <div className="col-span-12 mt-4">
          <HeroDemoIframe src={demoSrc} />
        </div>
      </div>
    </MarketingSection>
  );
}
