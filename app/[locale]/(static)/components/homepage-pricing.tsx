import type { Pricing } from "@/core/fumadocs/schemas/pricing";
import type { PricingTitle } from "@/core/fumadocs/schemas/homepage";

import { PricingSection as PricingSectionComponent } from "@/app/[locale]/(static)/pricing/components/pricing-section";

type Props = {
  pricingSection?: Pricing;
  pricingSectionTitle?: PricingTitle;
};

export function HomepagePricing({ pricingSection, pricingSectionTitle }: Props) {
  if (!pricingSection) return null;

  return (
    <section className="py-16 md:py-24 w-full" id="pricing">
      <div className="max-w-7xl mx-auto px-4">
        {pricingSectionTitle && (
          <div className="mb-12 text-center max-w-3xl mx-auto">
            <h2 className="text-x-3xl pb-4">{pricingSectionTitle.title}</h2>

            <p className="text-x-lg text-subdued">{pricingSectionTitle.subtitle}</p>
          </div>
        )}

        <PricingSectionComponent {...pricingSection} />
      </div>
    </section>
  );
}
