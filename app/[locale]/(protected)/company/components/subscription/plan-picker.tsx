"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { cn } from "@/lib/utils";

export type SelectablePlan = "starter" | "pro" | "business";

const SELECTABLE_PLANS: SelectablePlan[] = ["starter", "pro", "business"];

type Props = {
  isLoading?: boolean;
  onSelect: (plan: SelectablePlan) => void;
};

export function PlanPicker({ isLoading, onSelect }: Props) {
  const t = useTranslations();

  function handleCardClick(plan: SelectablePlan) {
    if (!isLoading) onSelect(plan);
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
      {SELECTABLE_PLANS.map((plan) => {
        const featured = plan === "business";
        const features = t.raw(`Subscription.picker.features.${plan}`) as string[];

        return (
          <div
            key={plan}
            className={cn(
              "interactive-surface flex flex-col gap-3 rounded-xl border bg-card p-4",
              featured ? "border-2 border-primary" : "border-border",
            )}
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick(plan)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") handleCardClick(plan);
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{t(`Subscription.planNames.${plan}`)}</h4>

              {featured && <AppChip variant="info">{t("Subscription.picker.mostPopular")}</AppChip>}
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold">{t(`Subscription.picker.price.${plan}`)}</span>

              <span className="text-xs text-muted-foreground">{t("Subscription.picker.perUserMonth")}</span>
            </div>

            <ul className="flex flex-col gap-1.5">
              {features.map((feature, index) => (
                <li key={index} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Check aria-hidden className="mt-0.5 size-3 shrink-0 text-primary" strokeWidth={2.5} />

                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
