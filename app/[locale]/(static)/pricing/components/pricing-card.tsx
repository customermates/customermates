import type { PricingCard } from "@/core/fumadocs/schemas/pricing";

import { Check, Minus } from "lucide-react";

import { MarketingButton } from "@/components/marketing/marketing-button";
import { cn } from "@/core/utils/cn";

type Props = {
  card: PricingCard;
  compact?: boolean;
  displayPrice: string;
  priceSubtext?: string;
};

export function PricingCardComponent({ card, compact = false, displayPrice, priceSubtext }: Props) {
  const featured = card.featured === true;
  const buttonVariant = featured || card.plan === "enterprise" ? "primary" : "secondary";

  if (compact) {
    return (
      <article
        className="mk-card flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between"
        data-pricing-plan={card.plan}
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <h2 className="mk-title m-0">{card.title}</h2>

            <span className="text-xl font-semibold tracking-[-0.03em] tabular-nums">{displayPrice}</span>

            {priceSubtext && <span className="text-[13px] text-muted-foreground">{priceSubtext}</span>}
          </div>

          <p className="m-0 mt-1 text-[13px] leading-relaxed text-muted-foreground">{card.description}</p>

          <ul className="m-0 mt-4 grid content-start gap-2 p-0">
            {card.features.slice(1, 4).map((feature, index) => (
              <li key={index} className="flex items-start gap-2 text-[13px] leading-5 text-foreground">
                <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />

                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <MarketingButton className="shrink-0" href={card.buttonHref} variant={buttonVariant}>
          {card.buttonText}
        </MarketingButton>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "mk-card flex flex-col p-6 sm:p-7 md:row-span-5 md:grid md:grid-rows-subgrid",
        featured && "mk-card-featured pricing-card-featured max-md:order-first",
      )}
      data-pricing-featured={featured ? "true" : undefined}
      data-pricing-plan={card.plan}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="mk-title m-0">{card.title}</h2>

        {card.badge && <span className={cn("mk-badge", featured && "mk-badge-strong")}>{card.badge}</span>}
      </div>

      <p className="m-0 mt-2 min-h-10 text-[13px] leading-relaxed text-muted-foreground">{card.description}</p>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 py-4">
        <span className="text-[2.5rem] font-semibold tracking-[-0.04em] tabular-nums">{displayPrice}</span>

        {priceSubtext && <span className="text-[13px] text-muted-foreground">{priceSubtext}</span>}
      </div>

      <MarketingButton arrow={featured} className="w-full" href={card.buttonHref} variant={buttonVariant}>
        {card.buttonText}
      </MarketingButton>

      <ul className="m-0 mt-6 grid content-start gap-3 p-0">
        {[
          ...card.features.map((feature) => ({ feature, missing: false })),
          ...(card.missingFeatures ?? []).map((feature) => ({ feature, missing: true })),
        ].map(({ feature, missing }, index) => {
          const Icon = missing ? Minus : Check;

          return (
            <li
              key={index}
              className={cn(
                "flex items-start gap-2.5 text-[13.5px] leading-5",
                missing ? "text-muted-foreground" : "text-foreground",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  featured && !missing ? "text-foreground" : "text-muted-foreground",
                )}
                strokeWidth={2.25}
              />

              <span>{feature}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
