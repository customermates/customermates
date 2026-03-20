"use client";

import type { FC, SVGProps } from "react";

import * as HeroiconsOutline from "@heroicons/react/24/outline";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XImage } from "@/components/x-image";
import { XIconContainer } from "@/components/x-icon-container";
import { XSectionBadge } from "@/components/x-section-badge";

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

export function XFeatureSection({ badge, features, subtitle, title }: Props) {
  return (
    <section className="py-14 md:py-20 w-full max-w-6xl px-4" id="features">
      <div className="text-center mb-10 md:mb-16">
        <XSectionBadge className="mb-4">{badge}</XSectionBadge>

        <h2 className="text-x-3xl">{title}</h2>

        <p className="mt-4 text-x-xl text-subdued max-w-2xl mx-auto">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {features.map((feature, index) => {
          const Icon = (HeroiconsOutline as Record<string, FC<SVGProps<SVGSVGElement>>>)[feature.icon];

          return (
            <XCard key={index}>
              <XCardBody className={feature.image ? "gap-2" : ""}>
                <XIconContainer icon={Icon} />

                <div className="flex flex-col gap-1">
                  <h3 className="text-x-xl">{feature.title}</h3>

                  <p className="text-subdued text-x-sm mb-2">{feature.description}</p>
                </div>

                {feature.image && (
                  <XImage
                    alt={feature.title}
                    className="w-full rounded-lg"
                    height={900}
                    src={feature.image}
                    width={1516}
                  />
                )}
              </XCardBody>
            </XCard>
          );
        })}
      </div>
    </section>
  );
}
