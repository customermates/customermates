"use client";

import type { Pricing } from "@/core/fumadocs/schemas/pricing";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Slider } from "@/components/ui/slider";

import { PricingCardComponent } from "./pricing-card";
import { formatCommercialAmount, getCommercialOffer, totalPriceAmountMinor } from "@/core/commercial/plan-catalog";

const MAX_USERS = 25;
const USER_STOPS = [1, 5, 10, 15, 20, MAX_USERS] as const;

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

  return (
    <>
      <div className="marketing-grid items-center gap-y-7 rounded-card border border-border bg-card px-5 py-6 sm:px-6 sm:py-8">
        <div className="col-span-12 flex items-end justify-between gap-6 sm:justify-start lg:col-span-4">
          <div>
            <p className="text-eyebrow">{users}</p>

            <output
              aria-atomic="true"
              aria-live="polite"
              className="mt-2 block text-4xl font-medium tracking-tight tabular-nums"
              htmlFor="pricing-user-count"
            >
              {userCount}
            </output>
          </div>
        </div>

        <div className="col-span-12 lg:col-start-6 lg:col-end-13">
          <Slider
            aria-label={ariaLabelSlider}
            className="mb-3 w-full"
            id="pricing-user-count"
            max={MAX_USERS}
            min={1}
            step={1}
            value={[userCount]}
            onValueChange={(values) => setUserCount(values[0] ?? 1)}
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            {USER_STOPS.map((value) => (
              <span key={value} className={userCount >= value ? "font-medium text-foreground" : undefined}>
                {value}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-card border-l border-t border-border md:grid-cols-2 xl:grid-cols-4">
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

      {footnote ? (
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-muted-foreground">{footnote}</p>
      ) : null}
    </>
  );
}
