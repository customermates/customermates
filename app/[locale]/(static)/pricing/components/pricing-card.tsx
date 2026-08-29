import type { PricingCard } from "@/core/fumadocs/schemas/pricing";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";

type Props = {
  card: PricingCard;
  displayPrice: string;
  priceSubtext?: string;
};

export function PricingCardComponent({ card, displayPrice, priceSubtext }: Props) {
  const featured = card.featured === true;
  const buttonVariant = card.buttonVariant === "bordered" ? "secondary" : "default";

  return (
    <article
      className={`flex h-full flex-col border-b border-r border-border p-5 sm:p-6 ${featured ? "bg-sidebar" : "bg-background"}`}
      data-pricing-featured={featured ? "true" : undefined}
      data-pricing-plan={card.plan}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-[19px] font-semibold">{card.title}</h3>

        {card.badge && (
          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-foreground">
            {card.badge}
          </span>
        )}
      </div>

      <p className="m-0 mt-2 min-h-10 text-[13px] leading-relaxed text-muted-foreground">{card.description}</p>

      <div className="my-4">
        <div>
          <span className="text-[34px] font-medium tracking-[-0.03em] tabular-nums">{displayPrice}</span>

          {priceSubtext && <span className="ml-1.5 text-[13px] text-muted-foreground">{priceSubtext}</span>}
        </div>
      </div>

      <Button asChild className="w-full" variant={buttonVariant}>
        <AppLink href={card.buttonHref}>{card.buttonText}</AppLink>
      </Button>

      <ul className="-mx-5 m-0 mt-5 divide-y divide-border border-t border-border p-0 sm:-mx-6">
        {card.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 px-5 py-3 text-[13px] leading-5 text-foreground sm:px-6">
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />

            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
