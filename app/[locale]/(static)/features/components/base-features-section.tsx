import type { Feature } from "@/core/fumadocs/schemas/features";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { FeatureIcon } from "@/components/shared/feature-icon";
import { IconContainer } from "@/components/shared/icon-container";
import { ICONS } from "@/components/shared/icons";

type Props = Feature & { index?: number };

export function BaseFeaturesSection({ features, hasSecondaryBackground = false, index, subtitle, title }: Props) {
  const heroFeature = features.length >= 3 ? features[0] : null;
  const restFeatures = heroFeature ? features.slice(1) : features;
  const heroSpansTwoRows = features.length >= 4;

  const HeroIcon = heroFeature ? ICONS[heroFeature.icon] : null;
  const numberLabel = typeof index === "number" ? String(index + 1).padStart(2, "0") : null;

  return (
    <section className={`relative w-full py-12 md:py-16 ${hasSecondaryBackground ? "bg-muted/50" : ""}`}>
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-10 md:mb-12">
          {numberLabel ? (
            <div className="mb-3 flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.08em] text-subdued">
              <span className="font-medium text-primary">{numberLabel}</span>

              <span>{title}</span>

              <span className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
            </div>
          ) : null}

          <h2 className="text-x-3xl mb-3">{title}</h2>

          <p className="text-x-lg max-w-2xl text-subdued">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:auto-rows-fr lg:grid-cols-4">
          {heroFeature && HeroIcon ? (
            <AppCard
              className={`relative overflow-hidden md:col-span-2 lg:col-span-2 ${heroSpansTwoRows ? "lg:row-span-2" : ""}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-primary/10 blur-2xl"
              />

              <AppCardBody className="relative justify-center gap-5">
                <IconContainer className="size-12" icon={HeroIcon} iconClassName="h-5 w-5" iconSize="md" size="lg" />

                <div className="flex flex-col gap-2">
                  <h3 className="text-x-xl font-semibold">{heroFeature.title}</h3>

                  <p className="text-subdued leading-relaxed">{heroFeature.description}</p>
                </div>
              </AppCardBody>
            </AppCard>
          ) : null}

          {restFeatures.map((feature, idx) => {
            const IconComponent = ICONS[feature.icon];

            return (
              <AppCard key={idx}>
                <AppCardBody>
                  <FeatureIcon icon={IconComponent} />

                  <h3 className="font-semibold">{feature.title}</h3>

                  <p className="text-x-sm leading-relaxed text-subdued">{feature.description}</p>
                </AppCardBody>
              </AppCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
