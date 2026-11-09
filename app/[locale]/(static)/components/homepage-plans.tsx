import type { HomepagePlans as HomepagePlansContent } from "@/core/fumadocs/schemas/homepage";

import { ArrowRight, Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppLink } from "@/components/shared/app-link";
import { MarketingButton } from "@/components/marketing/marketing-button";
import { cn } from "@/core/utils/cn";

import { SectionHeader } from "@/components/marketing/section-header";

export function HomepagePlans({ plans }: { plans: HomepagePlansContent }) {
  return (
    <MarketingSection className="mk-section" id="pricing">
      <SectionHeader description={plans.description} eyebrow={plans.eyebrow} title={plans.title} />

      <ul className="mx-auto mt-12 grid max-w-[68rem] gap-4 md:grid-cols-3">
        {plans.items.map((plan) => (
          <li
            key={plan.name}
            data-reveal
            className={cn("mk-card flex flex-col p-6", plan.badge && "mk-card-featured max-md:order-first")}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>

              {plan.badge ? <span className="mk-badge mk-badge-strong">{plan.badge}</span> : null}
            </div>

            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-[2.5rem] leading-none font-semibold tracking-[-0.03em] text-foreground tabular-nums">
                {plan.price}
              </span>

              <span className="text-sm text-muted-foreground">{plans.perSeat}</span>
            </p>

            <p className="mt-3 text-[0.9375rem] text-foreground">{plan.job}</p>

            <ul className="mt-5 flex-1 space-y-2.5">
              {plan.points.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                  <Check aria-hidden className="mt-1 size-3.5 shrink-0 text-foreground" />

                  {point}
                </li>
              ))}
            </ul>

            <MarketingButton
              className="mt-7 w-full"
              href={plans.ctaHref}
              size="lg"
              variant={plan.badge ? "primary" : "secondary"}
            >
              {plans.cta}
            </MarketingButton>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center">
        <AppLink
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          href={plans.compareHref}
        >
          {plans.compareLabel}

          <ArrowRight
            aria-hidden
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </AppLink>
      </p>
    </MarketingSection>
  );
}
