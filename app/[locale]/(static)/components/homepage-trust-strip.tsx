import type { HomepageTrust } from "@/core/fumadocs/schemas/homepage";

import { CodeXml, MapPin } from "lucide-react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { AppLink } from "@/components/shared/app-link";

import { HOMEPAGE_SOURCE_AVAILABLE_HREF } from "./homepage-hero";

export function HomepageTrustStrip({ trust }: { trust: HomepageTrust }) {
  return (
    <section aria-label={trust.label} className="w-full" data-homepage-trust="">
      <MarketingContainer className="pt-10 pb-2 sm:pt-12">
        <ul className="homepage-trust">
          <li>
            <span aria-hidden className="mk-icon-tile size-7">
              <MapPin className="size-3.5" />
            </span>

            {trust.database}
          </li>

          <li>
            <span aria-hidden className="mk-icon-tile size-7">
              <CodeXml className="size-3.5" />
            </span>

            <AppLink appearance="unstyled" className="homepage-hero-source-link" href={HOMEPAGE_SOURCE_AVAILABLE_HREF}>
              {trust.sourceAvailable}
            </AppLink>
          </li>

          <li>
            <span aria-hidden className="homepage-ai-stack">
              <span data-ai-logo="claude">
                <AiClientLogo className="size-3.5" provider="claude" />
              </span>

              <span data-ai-logo="chatgpt">
                <AiClientLogo className="size-3.5" provider="chatgpt" />
              </span>
            </span>

            {trust.agents}
          </li>
        </ul>
      </MarketingContainer>
    </section>
  );
}
