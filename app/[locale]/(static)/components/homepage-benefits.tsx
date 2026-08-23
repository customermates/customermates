import type { Benefits } from "@/core/fumadocs/schemas/homepage";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";

type Props = {
  benefitsSection: Benefits;
};

export function HomepageBenefits({ benefitsSection }: Props) {
  return (
    <MarketingSection description={benefitsSection.subtitle} id="benefits" title={benefitsSection.title}>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
        {benefitsSection.benefits.map((benefit) => {
          const IconComponent = ICONS[benefit.icon];

          return (
            <article key={benefit.title} className="rounded-card border border-border bg-card p-6">
              <span className="text-muted-foreground">
                <Icon icon={IconComponent} />
              </span>

              <h3 className="mt-6 font-medium leading-tight">{benefit.title}</h3>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
            </article>
          );
        })}
      </div>
    </MarketingSection>
  );
}
