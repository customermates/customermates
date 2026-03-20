import type { FC, SVGProps } from "react";
import type { Benefits } from "@/core/fumadocs/schemas/homepage";

import * as HeroiconsSolid from "@heroicons/react/24/outline";

import { XIconContainer } from "@/components/x-icon-container";

type Props = {
  benefitsSection: Benefits;
};

export function HomepageBenefits({ benefitsSection }: Props) {
  return (
    <section className="py-14 md:py-20 w-full max-w-6xl px-4" id="benefits">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
        {benefitsSection.benefits.map((benefit, index) => {
          const Icon = (HeroiconsSolid as Record<string, FC<SVGProps<SVGSVGElement>>>)[benefit.icon];

          return (
            <div key={index} className="space-y-4">
              <XIconContainer icon={Icon} />

              <h3 className="text-x-2xl">{benefit.title}</h3>

              <p className="text-subdued text-x-md">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
