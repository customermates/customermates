"use client";

import type { FeatureItem } from "@/core/fumadocs/schemas/features";

import { ICONS } from "@/components/shared/icons";
import { IconContainer } from "@/components/shared/icon-container";

type Props = {
  description: string;
  features: FeatureItem[];
  title: string;
};

export function WhyFeaturesSection({ description, features, title }: Props) {
  return (
    <section className="relative py-12 md:py-16 w-full bg-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-x-3xl mb-4">{title}</h2>

          <p className="text-x-lg text-subdued">{description}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto">
          {features.map((feature, index) => {
            const Icon = ICONS[feature.icon];

            return (
              <div key={index} className="flex gap-4">
                <div className="shrink-0">
                  <IconContainer icon={Icon} />
                </div>

                <div>
                  <h3 className="font-semibold mb-2 text-x-xl">{feature.title}</h3>

                  <p className="text-x-sm text-subdued leading-relaxed">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
