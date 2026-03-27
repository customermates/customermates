import type { FC, SVGProps } from "react";
import type { Benefits } from "@/core/fumadocs/schemas/homepage";

import * as HeroiconsOutline from "@heroicons/react/24/outline";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XIcon } from "@/components/x-icon";
import { XSectionBadge } from "@/components/x-section-badge";

type Props = {
  benefitsSection: Benefits;
};

export function HomepageBenefits({ benefitsSection }: Props) {
  return (
    <section className="py-14 md:py-20 w-full max-w-[1200px] px-4 mx-auto" id="benefits">
      <div className="text-center mb-10 md:mb-16">
        <XSectionBadge className="mb-4">{benefitsSection.badge}</XSectionBadge>

        <h2 className="text-x-3xl">{benefitsSection.title}</h2>

        <p className="mt-4 text-x-xl text-subdued max-w-2xl mx-auto">{benefitsSection.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {benefitsSection.benefits.map((benefit, index) => {
          const Icon = (HeroiconsOutline as Record<string, FC<SVGProps<SVGSVGElement>>>)[benefit.icon];

          return (
            <XCard key={index}>
              <XCardBody>
                <h3 className="font-semibold flex items-center gap-2">
                  <div className="text-subdued">
                    <XIcon icon={Icon} />
                  </div>

                  {benefit.title}
                </h3>

                <p className="text-x-sm text-subdued leading-relaxed">{benefit.description}</p>
              </XCardBody>
            </XCard>
          );
        })}
      </div>
    </section>
  );
}
