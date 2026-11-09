import type { FeatureItem } from "@/core/fumadocs/schemas/features";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";

type Props = {
  description: string;
  features: FeatureItem[];
  title: string;
};

export function WhyFeaturesSection({ description, features, title }: Props) {
  return (
    <MarketingSection className="mk-section">
      <SectionHeader description={description} title={title} />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const IconComponent = ICONS[feature.icon];

          return (
            <li key={feature.title} data-reveal className="mk-card p-6 sm:p-7">
              <span className="grid size-9 place-items-center rounded-lg border border-border bg-card text-foreground">
                <Icon aria-hidden icon={IconComponent} />
              </span>

              <h3 className="mt-6 text-lg font-semibold tracking-tight">{feature.title}</h3>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </li>
          );
        })}
      </ul>
    </MarketingSection>
  );
}
