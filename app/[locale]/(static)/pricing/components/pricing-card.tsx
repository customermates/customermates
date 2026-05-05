import type { PricingCard } from "@/core/fumadocs/schemas/pricing";

import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";

type Props = {
  card: PricingCard;
  displayPrice: string;
};

export function PricingCardComponent({ card, displayPrice }: Props) {
  const featured = Boolean(card.badge);
  const buttonVariant = card.buttonVariant === "bordered" ? "outline" : "default";

  return (
    <div
      className={`relative flex h-full flex-col rounded-xl bg-card p-6 shadow-xs ${
        featured ? "border-2 border-primary" : ""
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-[19px] font-semibold">{card.title}</h3>

        {card.badge && (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            {card.badge}
          </span>
        )}
      </div>

      <p className="m-0 min-h-[40px] text-[13px] leading-[1.55] text-muted-foreground">{card.description}</p>

      <div className="my-4">
        <span className="text-[34px] font-bold tracking-[-0.02em]">{displayPrice}</span>

        {card.priceSubtext && <span className="ml-1.5 text-[13px] text-muted-foreground">{card.priceSubtext}</span>}
      </div>

      <Button asChild className="w-full" variant={buttonVariant}>
        <AppLink href={card.buttonHref}>{card.buttonText}</AppLink>
      </Button>

      <ul className="m-0 mt-4 flex flex-col gap-2 p-0">
        {card.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-[13px] text-foreground">
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.5} />

            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
