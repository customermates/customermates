import type { Benefits } from "@/core/fumadocs/schemas/automation";

import { IconContainer } from "@/components/shared/icon-container";
import { ICONS } from "@/components/shared/icons";

type Props = {
  benefitsSection: Benefits;
};

export function AutomationBenefits({ benefitsSection }: Props) {
  return (
    <section className="relative py-14 md:py-20 w-full max-w-6xl px-4" id="benefits">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
        {benefitsSection.benefits.map((benefit, index) => {
          const Icon = ICONS[benefit.icon];

          return (
            <div key={index} className="space-y-4">
              <IconContainer icon={Icon} />

              <h3 className="text-x-2xl">{benefit.title}</h3>

              <p className="text-subdued text-x-md">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
