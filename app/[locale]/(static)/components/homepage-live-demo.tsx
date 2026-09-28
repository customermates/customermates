import type { HomepageProductProof } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { MarketingSection } from "@/components/marketing/marketing-section";

import { HeroDemoIframe } from "./hero-demo-iframe";

export function HomepageLiveDemo({ locale, proof }: { locale: ContentLocale; proof: HomepageProductProof }) {
  const localBaseUrl = process.env.BASE_URL?.replace(/\/$/u, "");
  const demoPath = `/${locale}/dashboard?agentChat=open`;
  const demoSrc =
    process.env.NODE_ENV === "development" && localBaseUrl
      ? `${localBaseUrl}${demoPath}`
      : `https://demo.customermates.com${demoPath}`;

  return (
    <MarketingSection
      containerClassName="scroll-mt-8 !max-w-[86rem] !px-3 sm:!px-4"
      id="live-demo"
      title={proof.demoTitle}
    >
      <div className="mt-10 sm:mt-12 lg:mt-14">
        <HeroDemoIframe size="full" src={demoSrc} />
      </div>
    </MarketingSection>
  );
}
