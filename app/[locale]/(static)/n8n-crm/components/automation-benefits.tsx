import type { Benefits } from "@/core/fumadocs/schemas/automation";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { ICONS } from "@/components/shared/icons";

type Props = {
  benefitsSection: Benefits;
};

export function AutomationBenefits({ benefitsSection }: Props) {
  return (
    <MarketingSection id="benefits" tone="page">
      <div className="grid overflow-hidden rounded-card border border-border bg-card sm:grid-cols-2 lg:grid-cols-3">
        {benefitsSection.benefits.map((benefit) => {
          const Icon = ICONS[benefit.icon];

          return (
            <div
              key={benefit.title}
              className="border-b border-border p-6 last:border-b-0 sm:border-r sm:p-7 sm:[&:nth-child(even)]:border-r-0 lg:[&:nth-child(even)]:border-r lg:[&:nth-child(3n)]:border-r-0 lg:[&:nth-last-child(-n+3)]:border-b-0"
            >
              <span className="grid size-9 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              </span>

              <h3 className="mt-5 text-base font-medium">{benefit.title}</h3>

              <p className="mt-2 text-sm leading-6 text-subdued">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </MarketingSection>
  );
}
