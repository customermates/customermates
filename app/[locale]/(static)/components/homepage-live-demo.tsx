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
      className="!pt-8 !pb-20 sm:!pt-12"
      containerClassName="scroll-mt-8 !max-w-[86rem] !px-3 sm:!px-4"
      id="live-demo"
    >
      <h2 className="sr-only">{proof.demoTitle}</h2>

      <HeroDemoIframe size="full" src={demoSrc} />
    </MarketingSection>
  );
}
