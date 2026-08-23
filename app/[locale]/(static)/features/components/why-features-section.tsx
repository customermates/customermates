"use client";

import type { FeatureItem } from "@/core/fumadocs/schemas/features";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { ICONS } from "@/components/shared/icons";
import { IconContainer } from "@/components/shared/icon-container";

type Props = {
  description: string;
  features: FeatureItem[];
  title: string;
};

export function WhyFeaturesSection({ description, features, title }: Props) {
  return (
    <MarketingSection alignBody description={description} title={title}>
      <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:mt-16">
        {features.map((feature) => {
          const Icon = ICONS[feature.icon];

          return (
            <div key={feature.title} className="flex gap-4">
              <div className="shrink-0">
                <IconContainer icon={Icon} />
              </div>

              <div>
                <h3 className="font-medium leading-tight">{feature.title}</h3>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </MarketingSection>
  );
}
