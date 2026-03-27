"use client";

import type { FC, SVGProps } from "react";
import type { Feature } from "@/core/fumadocs/schemas/features";

import * as HeroiconsOutline from "@heroicons/react/24/outline";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XIcon } from "@/components/x-icon";

type Props = Feature;

export function BaseFeaturesSection({
  features,
  gridCols = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  hasSecondaryBackground = false,
  subtitle,
  title,
}: Props) {
  const cardShadow = hasSecondaryBackground ? "md" : "sm";

  return (
    <section className={`py-12 md:py-16 w-full ${hasSecondaryBackground ? "bg-content1" : ""}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-12">
          <h2 className="text-x-3xl mb-4">{title}</h2>

          <p className="text-x-lg text-subdued">{subtitle}</p>
        </div>

        <div className={`grid ${gridCols || "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"} gap-4`}>
          {features.map((feature, index) => {
            const Icon = (HeroiconsOutline as Record<string, FC<SVGProps<SVGSVGElement>>>)[feature.icon];

            return (
              <XCard key={index} shadow={cardShadow}>
                <XCardBody>
                  <h3 className="font-semibold flex items-center gap-2">
                    <div className="text-subdued">
                      <XIcon icon={Icon} />
                    </div>

                    {feature.title}
                  </h3>

                  <p className="text-x-sm text-subdued leading-relaxed">{feature.description}</p>
                </XCardBody>
              </XCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
