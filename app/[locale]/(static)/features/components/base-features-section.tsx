import type { Feature } from "@/core/fumadocs/schemas/features";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { FeatureIcon } from "@/components/shared/feature-icon";
import { IconContainer } from "@/components/shared/icon-container";
import { ICONS } from "@/components/shared/icons";
import { cn } from "@/core/utils/cn";

type Props = Feature;

export function BaseFeaturesSection({ features, hasSecondaryBackground = false, subtitle, title }: Props) {
  const heroFeature = features.length >= 3 ? features[0] : null;
  const restFeatures = heroFeature ? features.slice(1) : features;
  const heroSpansTwoRows = features.length >= 4;

  const HeroIcon = heroFeature ? ICONS[heroFeature.icon] : null;

  return (
    <MarketingSection className={cn(hasSecondaryBackground && "bg-sidebar")} description={subtitle} title={title}>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-16 lg:auto-rows-fr lg:grid-cols-4">
        {heroFeature && HeroIcon ? (
          <article
            className={cn(
              "flex flex-col justify-center gap-5 rounded-card border border-border bg-card p-6 sm:col-span-2 sm:p-7",
              heroSpansTwoRows && "lg:row-span-2",
            )}
          >
            <IconContainer className="size-12" icon={HeroIcon} iconClassName="h-5 w-5" iconSize="md" size="lg" />

            <div className="flex flex-col gap-2">
              <h3 className="text-xl font-medium leading-tight">{heroFeature.title}</h3>

              <p className="leading-relaxed text-muted-foreground">{heroFeature.description}</p>
            </div>
          </article>
        ) : null}

        {restFeatures.map((feature) => {
          const IconComponent = ICONS[feature.icon];

          return (
            <article key={feature.title} className="rounded-card border border-border bg-card p-6">
              <FeatureIcon icon={IconComponent} />

              <h3 className="mt-6 font-medium leading-tight">{feature.title}</h3>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </article>
          );
        })}
      </div>
    </MarketingSection>
  );
}
