"use client";

import type { PricingCard } from "@/core/fumadocs/schemas/pricing";

import { CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";

import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XIcon } from "@/components/x-icon";
import { XLink } from "@/components/x-link";

type Props = {
  annualPrice: number;
  card: PricingCard;
  isAnnual: boolean;
  planType: "basic" | "pro" | "static";
  monthlyPrice: number;
};

export function PricingCardComponent({ annualPrice, card, isAnnual, monthlyPrice, planType }: Props) {
  const dynamicPrice = planType !== "static" ? `${Math.round(isAnnual ? annualPrice / 12 : monthlyPrice)}` : card.price;

  const transformedFeatures = card.features.map((text) => ({
    icon: CheckIcon,
    text,
  }));

  return (
    <XCard className={`h-full ${card.cardClassName || ""}`} shadow={card.shadow || "sm"}>
      <XCardBody>
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-x-xl">{card.title}</h3>

            {card.badge && (
              <span className="px-2 py-0.5 text-x-xs bg-primary-500/30 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 rounded-full border border-primary-500/40 dark:border-primary-500/30">
                {card.badge}
              </span>
            )}
          </div>

          <p className="text-x-sm text-subdued h-10">{card.description}</p>
        </div>

        <div className="mb-6">
          <div>
            <span className="text-x-3xl">{dynamicPrice}</span>

            {card.priceSubtext && <span className="ml-1 text-default-500">{card.priceSubtext}</span>}
          </div>
        </div>

        <Button
          as={XLink}
          className="w-full"
          color={card.buttonColor}
          href={card.buttonHref}
          size="lg"
          variant={card.buttonVariant}
        >
          {card.buttonText}
        </Button>

        <div className="mt-6 mb-1 space-y-3">
          {transformedFeatures.map((feature, featureIndex) => (
            <div key={featureIndex} className="flex items-center">
              <XIcon className="text-primary-600 dark:text-primary-400 mr-3 shrink-0" icon={feature.icon} size="sm" />

              <span className="text-x-sm">{feature.text}</span>
            </div>
          ))}
        </div>
      </XCardBody>
    </XCard>
  );
}
