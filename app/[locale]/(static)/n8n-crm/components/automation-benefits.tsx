import type { Benefits } from "@/core/fumadocs/schemas/automation";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { IconContainer } from "@/components/shared/icon-container";
import { ICONS } from "@/components/shared/icons";

type Props = {
  benefitsSection: Benefits;
};

export function AutomationBenefits({ benefitsSection }: Props) {
  return (
    <MarketingSection id="benefits">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-16">
        {benefitsSection.benefits.map((benefit) => {
          const Icon = ICONS[benefit.icon];

          return (
            <div key={benefit.title} className="space-y-4">
              <IconContainer icon={Icon} />

              <h3 className="text-xl font-medium leading-tight">{benefit.title}</h3>

              <p className="leading-relaxed text-muted-foreground">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </MarketingSection>
  );
}
