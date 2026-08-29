import type { FeatureItem } from "@/core/fumadocs/schemas/features";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";

type Props = {
  description: string;
  features: FeatureItem[];
  title: string;
};

export function WhyFeaturesSection({ description, features, title }: Props) {
  return (
    <MarketingSection className="py-16 sm:py-20 lg:py-24" tone="canvas">
      <div className="marketing-grid gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <h2 className="text-display-sm">{title}</h2>

          <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="col-span-12 grid border-l border-t border-border sm:grid-cols-2 lg:col-start-6 lg:col-end-13">
          {features.map((feature) => {
            const IconComponent = ICONS[feature.icon];

            return (
              <article key={feature.title} className="border-b border-r border-border bg-sidebar p-5 sm:p-6">
                <Icon aria-hidden className="text-muted-foreground" icon={IconComponent} size="md" />

                <h3 className="mt-5 text-sm font-semibold">{feature.title}</h3>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </MarketingSection>
  );
}
