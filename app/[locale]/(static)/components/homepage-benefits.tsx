"use client";

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The native horizontal scroll region needs a keyboard focus target. */

import type { Benefits } from "@/core/fumadocs/schemas/homepage";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";
import { cn } from "@/core/utils/cn";

type Props = {
  benefitsSection: Benefits;
};

export function HomepageBenefits({ benefitsSection }: Props) {
  const t = useTranslations();
  const shelfRef = useRef<HTMLDivElement>(null);

  function scrollShelf(direction: -1 | 1) {
    const shelf = shelfRef.current;
    if (!shelf) return;

    shelf.scrollBy({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      left: shelf.clientWidth * 0.85 * direction,
    });
  }

  return (
    <section
      className="w-full border-b border-foreground/15 py-20 sm:py-24 lg:py-32"
      data-homepage-section="benefits"
      id="benefits"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1.55fr)] lg:gap-12">
          <p className="pt-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {benefitsSection.badge}
          </p>

          <div>
            <h2
              className="m-0 max-w-[980px] text-[clamp(2.5rem,5.2vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.05em] text-balance"
              id="homepage-benefits-heading"
            >
              {benefitsSection.title}
            </h2>

            <p className="mt-5 max-w-[720px] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {benefitsSection.subtitle}
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-2 lg:hidden">
          <Button
            aria-label={t("OnboardingWizard.back")}
            className="rounded-full"
            size="icon"
            type="button"
            variant="secondary"
            onClick={() => scrollShelf(-1)}
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Button>

          <Button
            aria-label={t("OnboardingWizard.next")}
            className="rounded-full"
            size="icon"
            type="button"
            variant="secondary"
            onClick={() => scrollShelf(1)}
          >
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>

        <div
          ref={shelfRef}
          aria-labelledby="homepage-benefits-heading"
          className="-mx-5 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:mt-16 lg:grid lg:auto-rows-fr lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0"
          role="region"
          tabIndex={0}
        >
          {benefitsSection.benefits.map((benefit, index) => {
            const IconComponent = ICONS[benefit.icon];
            const featured = index === 0;

            return (
              <article
                key={benefit.title}
                aria-posinset={index + 1}
                aria-setsize={benefitsSection.benefits.length}
                className={cn(
                  "flex min-h-[360px] w-[82vw] max-w-[340px] shrink-0 snap-start flex-col justify-between rounded-[20px] bg-muted/45 p-6 sm:w-[42vw] sm:max-w-[420px] sm:p-7 lg:min-h-[230px] lg:w-auto lg:max-w-none lg:shrink lg:snap-none",
                  featured &&
                    "min-h-[420px] w-[86vw] max-w-[520px] bg-foreground text-background sm:w-[64vw] sm:max-w-[620px] lg:col-span-2 lg:row-span-2 lg:min-h-[480px] lg:w-auto lg:max-w-none",
                )}
              >
                <div
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full border border-foreground/15 text-muted-foreground",
                    featured && "border-background/25 text-background/75",
                  )}
                >
                  <Icon icon={IconComponent} />
                </div>

                <div className="mt-12">
                  <h3
                    className={cn(
                      "text-xl font-medium leading-tight tracking-[-0.025em]",
                      featured && "max-w-[620px] text-[clamp(2rem,4vw,4.25rem)] leading-[0.98] tracking-[-0.045em]",
                    )}
                  >
                    {benefit.title}
                  </h3>

                  <p
                    className={cn(
                      "mt-3 text-sm leading-relaxed text-muted-foreground",
                      featured && "max-w-[640px] text-base text-background/70 sm:text-lg",
                    )}
                  >
                    {benefit.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
