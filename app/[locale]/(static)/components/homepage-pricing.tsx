import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { cn } from "@/core/utils/cn";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { formatCommercialAmount, PLAN_CATALOG } from "@/core/commercial/plan-catalog";

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
    <MarketingSection description={t("HomepagePricing.subtitle")} id="pricing" title={t("HomepagePricing.title")}>
      <div className="mt-12 lg:mt-16">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CARDS.map((card) => {
            const featured = card.variant === "default";
            return (
              <div
                key={card.titleKey}
                className={cn(
                  "relative flex flex-col rounded-card border border-border bg-card p-6",
                  featured && "border-primary",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="m-0 text-lg font-medium">{t(`HomepagePricing.${card.titleKey}.title`)}</h3>

                  {card.badgeKey && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {t(`HomepagePricing.${card.titleKey}.${card.badgeKey}`)}
                    </span>
                  )}
                </div>

                <p className="m-0 min-h-10 text-sm leading-relaxed text-muted-foreground">
                  {t(`HomepagePricing.${card.titleKey}.tag`)}
                </p>

                <div className="my-4">
                  <span className="text-display-sm">
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

                  {card.periodKey && (
                    <span className="ml-1.5 text-sm text-muted-foreground">
                      {t(`HomepagePricing.${card.titleKey}.${card.periodKey}`)}
                    </span>
                  )}
                </div>

                <Button asChild className="w-full" variant={featured ? "default" : "secondary"}>
                  <AppLink external={card.href.startsWith("http")} href={card.href}>
                    {t(`HomepagePricing.${card.titleKey}.ctaText`)}
                  </AppLink>
                </Button>

                {card.compareHref && card.compareTextKey && (
                  <AppLink className="text-meta mt-3 text-center" href={card.compareHref}>
                    {t(`HomepagePricing.${card.titleKey}.${card.compareTextKey}`)}
                  </AppLink>
                )}

                <ul className="m-0 mt-4 flex flex-col gap-2 p-0">
                  {card.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="flex items-start gap-2 text-sm">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.5} />

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
              </div>
            );
          })}
        </div>

        <ul className="text-eyebrow mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {COMPARE_KEYS.map((key) => (
            <li key={key} className="inline-flex items-center gap-1.5">
              <Check aria-hidden className="size-3.5 text-success" strokeWidth={2.5} />

              {t(`HomepagePricing.compare.${key}`)}
            </li>
          ))}
        </ul>
      </div>
    </MarketingSection>
  );
}
