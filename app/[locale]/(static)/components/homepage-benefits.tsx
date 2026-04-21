import type { Benefits } from "@/core/fumadocs/schemas/homepage";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";
import { SectionBadge } from "@/components/marketing/section-badge";

type Props = {
  benefitsSection: Benefits;
};

export function HomepageBenefits({ benefitsSection }: Props) {
  return (
    <section className="relative py-14 md:py-20 w-full max-w-[1200px] px-4 mx-auto" id="benefits">
      <div className="text-center mb-10 md:mb-16">
        <SectionBadge className="mb-4">{benefitsSection.badge}</SectionBadge>

        <h2 className="text-x-3xl">{benefitsSection.title}</h2>

        <p className="mt-4 text-x-xl text-subdued max-w-2xl mx-auto">{benefitsSection.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {benefitsSection.benefits.map((benefit, index) => {
          const IconComponent = ICONS[benefit.icon];

          return (
            <AppCard key={index}>
              <AppCardBody>
                <h3 className="font-semibold flex items-center gap-2">
                  <div className="text-subdued">
                    <Icon icon={IconComponent} />
                  </div>

                  {benefit.title}
                </h3>

                <p className="text-x-sm text-subdued leading-relaxed">{benefit.description}</p>
              </AppCardBody>
            </AppCard>
          );
        })}
      </div>
    </section>
  );
}
