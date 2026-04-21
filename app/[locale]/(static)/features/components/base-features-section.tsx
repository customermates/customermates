"use client";

import type { Feature } from "@/core/fumadocs/schemas/features";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";

type Props = Feature;

export function BaseFeaturesSection({
  features,
  gridCols = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  hasSecondaryBackground = false,
  subtitle,
  title,
}: Props) {
  return (
    <section className={`relative py-12 md:py-16 w-full ${hasSecondaryBackground ? "bg-muted/50" : ""}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-12">
          <h2 className="text-x-3xl mb-4">{title}</h2>

          <p className="text-x-lg text-subdued">{subtitle}</p>
        </div>

        <div className={`grid ${gridCols || "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"} gap-4`}>
          {features.map((feature, index) => {
            const IconComponent = ICONS[feature.icon];

            return (
              <AppCard key={index}>
                <AppCardBody>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon icon={IconComponent} />
                  </div>

                  <h3 className="font-semibold">{feature.title}</h3>

                  <p className="text-x-sm text-subdued leading-relaxed">{feature.description}</p>
                </AppCardBody>
              </AppCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
