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
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(16,185,129,0.10)_1px,transparent_0)] bg-size-[28px_28px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black,transparent_75%)]" />

        <div className="absolute -top-12 right-[8%] size-[300px] rounded-full bg-[rgba(18,148,144,0.16)] blur-[90px]" />

        <div className="absolute bottom-[8%] left-[6%] size-[320px] rounded-full bg-[rgba(16,185,129,0.13)] blur-[100px]" />

        <div className="absolute top-1/3 right-[18%] size-[200px] rounded-full bg-[rgba(245,158,11,0.10)] blur-[80px]" />
      </div>

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
