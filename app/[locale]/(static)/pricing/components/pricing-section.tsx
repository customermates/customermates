"use client";

import type { Pricing } from "@/core/fumadocs/schemas/pricing";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Slider } from "@/components/ui/slider";

import { PricingCardComponent } from "./pricing-card";
import { formatCommercialAmount, getCommercialOffer, totalPriceAmountMinor } from "@/core/commercial/plan-catalog";

export function pricingCardPresentation(options: {
  plan: Pricing["pricingCards"][number]["plan"];
  userCount: number;
  locale: string;
  customPrice: string;
  totalSuffixPlural?: string;
  totalSuffixSingular?: string;
}) {
  const offer = getCommercialOffer(options.plan, "monthly");
  const displayPrice = offer
    ? formatCommercialAmount(totalPriceAmountMinor(offer, options.userCount), options.locale, offer.currency)
    : options.customPrice;
  const totalSuffixTemplate = options.userCount === 1 ? options.totalSuffixSingular : options.totalSuffixPlural;

  return {
    displayPrice,
    priceSubtext:
      offer && totalSuffixTemplate ? totalSuffixTemplate.replace("{count}", String(options.userCount)) : undefined,
  };
}

type Props = Pricing;

export function PricingSection({
  ariaLabelSlider,
  customPrice,
  footnote,
  pricingCards: mdxPricingCards,
  totalSuffixPlural,
  totalSuffixSingular,
  users,
}: Props) {
  const [userCount, setUserCount] = useState(1);
  const locale = useLocale();

  const maxUsers = 25;

  return (
    <>
      <div className="max-w-xl mx-auto mb-8">
        <div className="mb-6">
          <div>
            <h3 className="mb-2 text-lg font-medium">{users}</h3>

            <div className="text-display-sm text-primary">{userCount}</div>
          </div>
        </div>

        <Slider
          aria-label={ariaLabelSlider}
          className="w-full mb-3"
          max={maxUsers}
          min={1}
          step={1}
          value={[userCount]}
          onValueChange={(values) => setUserCount(values[0] ?? 1)}
        />

        <div className="text-meta flex justify-between">
          {[1, 5, 10, 15, 20, maxUsers].map((value) => (
            <span key={value} className={userCount >= value ? "font-semibold text-primary" : ""}>
              {value}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 justify-center items-stretch">
        {mdxPricingCards.map((card) => {
          const { displayPrice, priceSubtext } = pricingCardPresentation({
            plan: card.plan,
            userCount,
            locale,
            customPrice,
            totalSuffixPlural,
            totalSuffixSingular,
          });

          return (
            <PricingCardComponent key={card.plan} card={card} displayPrice={displayPrice} priceSubtext={priceSubtext} />
          );
        })}
      </div>

      {footnote && <p className="text-meta mx-auto mt-6 max-w-3xl text-center">{footnote}</p>}
    </>
  );
}
