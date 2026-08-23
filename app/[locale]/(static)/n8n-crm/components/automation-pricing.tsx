import type { Pricing } from "@/core/fumadocs/schemas/pricing";
import type { PricingTitle } from "@/core/fumadocs/schemas/automation";

import { PricingSection as PricingSectionComponent } from "@/app/[locale]/(static)/pricing/components/pricing-section";

type Props = {
  pricingSection?: Pricing;
  pricingSectionTitle?: PricingTitle;
};

export function AutomationPricing({ pricingSection, pricingSectionTitle }: Props) {
  if (!pricingSection) return null;

  return (
    <section className="relative py-16 md:py-24 w-full" id="pricing">
      <div className="marketing-container">
        {pricingSectionTitle && (
          <div className="mb-12 text-center max-w-3xl mx-auto">
            <h2 className="text-display-sm pb-4">{pricingSectionTitle.title}</h2>

            <p className="text-lede mx-auto">{pricingSectionTitle.subtitle}</p>
          </div>
        )}

        <PricingSectionComponent {...pricingSection} />
      </div>
    </section>
  );
}
