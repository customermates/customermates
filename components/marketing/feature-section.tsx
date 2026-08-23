"use client";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { FeatureIcon } from "@/components/shared/feature-icon";
import { ICONS } from "@/components/shared/icons";
import { AppImage } from "@/components/shared/app-image";

type FeatureItem = {
  description: string;
  icon: string;
  image?: string;
  title: string;
};

type Props = {
  badge: string;
  features: FeatureItem[];
  subtitle: string;
  title: string;
};

export function FeatureSection({ badge, features, subtitle, title }: Props) {
  return (
    <MarketingSection description={subtitle} eyebrow={badge} id="features" title={title}>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16">
        {features.map((feature) => {
          const Icon = ICONS[feature.icon];

          return (
            <article
              key={feature.title}
              className="flex flex-col overflow-hidden rounded-card border border-border bg-card"
            >
              {feature.image ? (
                <AppImage
                  alt={feature.title}
                  className="aspect-hero w-full object-cover object-top"
                  height={900}
                  sizes="(max-width: 639px) 100vw, 50vw"
                  src={feature.image}
                  width={1516}
                />
              ) : null}

              <div className="flex flex-1 flex-col p-6 sm:p-7">
                <FeatureIcon icon={Icon} />

                <h3 className="mt-8 text-2xl font-medium leading-tight tracking-tight">{feature.title}</h3>

                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </MarketingSection>
  );
}
