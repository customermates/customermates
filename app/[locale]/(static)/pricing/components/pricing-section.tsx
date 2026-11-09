"use client";

import type { Pricing } from "@/core/fumadocs/schemas/pricing";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Slider } from "@/components/ui/slider";

import { ArrowRight } from "lucide-react";

import { AppLink } from "@/components/shared/app-link";

import { PricingCardComponent } from "./pricing-card";
import {
  FREE_PLAN_ID,
  formatCommercialAmount,
  getCommercialOffer,
  totalPriceAmountMinor,
} from "@/core/commercial/plan-catalog";

const MAX_USERS = 25;
const MAIN_PLANS: readonly string[] = ["starter", "pro", "business"];

export function pricingCardPresentation(options: {
  plan: Pricing["pricingCards"][number]["plan"];
  userCount: number;
  locale: string;
  customPrice: string;
  totalSuffixPlural?: string;
  totalSuffixSingular?: string;
}) {
  if (options.plan === FREE_PLAN_ID)
    return { displayPrice: formatCommercialAmount(0, options.locale, "EUR"), priceSubtext: undefined };
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
  moreTitle,
  pricingCards: mdxPricingCards,
  selfHost,
  totalSuffixPlural,
  totalSuffixSingular,
  users,
}: Props) {
  const [userCount, setUserCount] = useState(1);
  const locale = useLocale();
  const mainCards = mdxPricingCards.filter((card) => MAIN_PLANS.includes(card.plan));
  const freeCard = mdxPricingCards.find((card) => card.plan === FREE_PLAN_ID);
  const moreCards = mdxPricingCards.filter((card) => !MAIN_PLANS.includes(card.plan) && card.plan !== FREE_PLAN_ID);

  function renderCard(card: Props["pricingCards"][number], compact = false) {
    const { displayPrice, priceSubtext } = pricingCardPresentation({
      plan: card.plan,
      userCount,
      locale,
      customPrice,
      totalSuffixPlural,
      totalSuffixSingular,
    });

    return (
      <PricingCardComponent
        key={card.plan}
        card={card}
        compact={compact}
        displayPrice={displayPrice}
        priceSubtext={priceSubtext}
      />
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-xl items-center gap-5 rounded-card border border-border bg-card px-5 py-3">
        <p className="m-0 flex shrink-0 items-baseline gap-2 text-sm text-muted-foreground">
          {users}

          <output
            aria-atomic="true"
            aria-live="polite"
            className="min-w-6 text-lg font-semibold text-foreground tabular-nums"
            htmlFor="pricing-user-count"
          >
            {userCount}
          </output>
        </p>

        <div className="min-w-0 flex-1">
          <Slider
            aria-label={ariaLabelSlider}
            className="w-full"
            id="pricing-user-count"
            max={MAX_USERS}
            min={1}
            step={1}
            value={[userCount]}
            onValueChange={(values) => setUserCount(values[0] ?? 1)}
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:items-stretch">
        {mainCards.map((card) => renderCard(card))}
      </div>

      {freeCard ? (
        <p
          className="mk-body mt-5 flex flex-wrap items-baseline justify-center gap-x-2 text-center text-sm"
          data-pricing-plan={freeCard.plan}
        >
          <span>{freeCard.description}</span>

          <AppLink className="mk-link" href={freeCard.buttonHref}>
            {freeCard.buttonText}

            <ArrowRight aria-hidden />
          </AppLink>
        </p>
      ) : null}

      {moreCards.length > 0 ? (
        <div className="mt-12">
          {moreTitle ? <p className="mk-eyebrow mb-4 text-center">{moreTitle}</p> : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{moreCards.map((card) => renderCard(card, true))}</div>
        </div>
      ) : null}

      {selfHost ? (
        <p className="mk-body mt-10 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
          <span>{selfHost.text}</span>

          <AppLink className="mk-link" href={selfHost.href}>
            {selfHost.linkLabel}

            <ArrowRight aria-hidden />
          </AppLink>
        </p>
      ) : null}

      {footnote ? (
        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-muted-foreground">{footnote}</p>
      ) : null}
    </>
  );
}
