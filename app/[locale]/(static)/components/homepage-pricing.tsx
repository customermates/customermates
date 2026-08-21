import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { formatCommercialAmount, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { cn } from "@/core/utils/cn";

type CardConfig = {
  href: string;
  badgeKey?: string;
  periodKey?: string;
  titleKey: "selfHosted" | "cloud";
  variant: "secondary" | "default";
  featureKeys: string[];
  compareHref?: string;
  compareTextKey?: string;
};

const CARDS: CardConfig[] = [
  {
    titleKey: "selfHosted",
    href: "https://github.com/customermates/customermates",
    periodKey: "period",
    variant: "secondary",
    featureKeys: ["featureUsers", "featureRecords", "featureApi", "featureN8n", "featureCommunity"],
  },
  {
    titleKey: "cloud",
    href: "/auth/signup",
    badgeKey: "badge",
    periodKey: "period",
    variant: "default",
    featureKeys: ["featureStarter", "featurePro", "featureBusiness"],
    compareHref: "/pricing",
    compareTextKey: "compareText",
  },
];

const COMPARE_KEYS = ["gdpr", "noLimits", "openSource", "cancelAnytime"] as const;

export async function HomepagePricing() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <section
      className="w-full border-b border-foreground/15 py-20 sm:py-24 lg:py-32"
      data-homepage-section="pricing"
      id="pricing"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1.55fr)] lg:gap-12">
          <p className="pt-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t("HomepagePricing.eyebrow")}
          </p>

          <div>
            <h2 className="m-0 max-w-[980px] text-[clamp(2.5rem,5.2vw,5.25rem)] font-medium leading-[0.98] tracking-[-0.05em] text-balance">
              {t("HomepagePricing.title")}
            </h2>

            <p className="mt-5 max-w-[680px] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("HomepagePricing.subtitle")}
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 lg:mt-16">
          {CARDS.map((card) => {
            const featured = card.variant === "default";

            return (
              <article
                key={card.titleKey}
                className={cn(
                  "flex min-h-[560px] flex-col rounded-[24px] bg-muted/45 p-6 sm:p-8",
                  featured && "bg-foreground text-background",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="m-0 text-2xl font-medium tracking-[-0.03em]">
                    {t(`HomepagePricing.${card.titleKey}.title`)}
                  </h3>

                  {card.badgeKey ? (
                    <span
                      className={cn(
                        "rounded-full border border-foreground/20 px-3 py-1 text-xs",
                        featured && "border-background/25",
                      )}
                    >
                      {t(`HomepagePricing.${card.titleKey}.${card.badgeKey}`)}
                    </span>
                  ) : null}
                </div>

                <p
                  className={cn(
                    "mt-3 max-w-[520px] text-sm leading-relaxed text-muted-foreground",
                    featured && "text-background/65",
                  )}
                >
                  {t(`HomepagePricing.${card.titleKey}.tag`)}
                </p>

                <div className="mt-10">
                  <span className="text-[clamp(3rem,6vw,5.5rem)] font-medium leading-none tracking-[-0.055em]">
                    {card.titleKey === "cloud"
                      ? t("HomepagePricing.cloud.price", {
                          price: formatCommercialAmount(
                            PLAN_CATALOG.starter.offers.monthly.unitPriceMinor,
                            locale,
                            PLAN_CATALOG.starter.offers.monthly.currency,
                          ),
                        })
                      : t("HomepagePricing.selfHosted.price")}
                  </span>

                  {card.periodKey ? (
                    <span className={cn("ml-2 text-sm text-muted-foreground", featured && "text-background/65")}>
                      {t(`HomepagePricing.${card.titleKey}.${card.periodKey}`)}
                    </span>
                  ) : null}
                </div>

                <Button
                  asChild
                  className={cn(
                    "mt-8 h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/85",
                    featured && "bg-background text-foreground hover:bg-background/85",
                  )}
                >
                  <AppLink external={card.href.startsWith("http")} href={card.href}>
                    {t(`HomepagePricing.${card.titleKey}.ctaText`)}
                  </AppLink>
                </Button>

                {card.compareHref && card.compareTextKey ? (
                  <AppLink
                    className={cn(
                      "mt-3 text-center text-xs text-muted-foreground underline-offset-4 hover:underline",
                      featured && "text-background/65",
                    )}
                    href={card.compareHref}
                  >
                    {t(`HomepagePricing.${card.titleKey}.${card.compareTextKey}`)}
                  </AppLink>
                ) : null}

                <ul className="m-0 mt-8 flex flex-col border-t border-current/20 p-0">
                  {card.featureKeys.map((featureKey) => (
                    <li
                      key={featureKey}
                      className="flex items-start gap-3 border-b border-current/20 py-3.5 text-sm leading-relaxed last:border-b-0"
                    >
                      <Check aria-hidden className="mt-1 size-3.5 shrink-0" strokeWidth={2.5} />

                      <span>
                        {t(`HomepagePricing.${card.titleKey}.${featureKey}`, {
                          accounts:
                            featureKey === "featurePro"
                              ? PLAN_CATALOG.pro.entitlements.includedAccountsPerUser
                              : PLAN_CATALOG.business.entitlements.includedAccountsPerUser,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
          {COMPARE_KEYS.map((key) => (
            <span key={key} className="inline-flex items-center gap-2">
              <Check aria-hidden className="size-3.5" />

              {t(`HomepagePricing.compare.${key}`)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
