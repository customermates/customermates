import { Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { formatCommercialAmount, PLAN_CATALOG } from "@/core/commercial/plan-catalog";

type CardConfig = {
  badgeKey?: string;
  compareHref?: string;
  compareTextKey?: string;
  featureKeys: string[];
  href: string;
  periodKey?: string;
  titleKey: "cloud" | "selfHosted";
};

const CARDS: CardConfig[] = [
  {
    featureKeys: ["featureUsers", "featureRecords", "featureApi", "featureN8n", "featureCommunity"],
    href: "https://github.com/customermates/customermates",
    periodKey: "period",
    titleKey: "selfHosted",
  },
  {
    badgeKey: "badge",
    compareHref: "/pricing",
    compareTextKey: "compareText",
    featureKeys: ["featureStarter", "featurePro", "featureBusiness"],
    href: "/auth/signup",
    periodKey: "period",
    titleKey: "cloud",
  },
];

const COMPARE_KEYS = ["gdpr", "noLimits", "openSource", "cancelAnytime"] as const;

export async function HomepagePricing() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <MarketingSection id="pricing">
      <div className="marketing-grid gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{t("HomepagePricing.eyebrow")}</p>

          <h2 className="text-display-sm mt-5">{t("HomepagePricing.title")}</h2>

          <p className="text-lede mt-5">{t("HomepagePricing.subtitle")}</p>

          <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {COMPARE_KEYS.map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <Check aria-hidden className="size-3.5 text-success" strokeWidth={2.25} />

                {t(`HomepagePricing.compare.${key}`)}
              </span>
            ))}
          </div>
        </div>

        <div className="col-span-12 grid gap-4 md:grid-cols-2 lg:col-start-6 lg:col-end-13">
          {CARDS.map((card) => {
            const featured = card.titleKey === "cloud";
            return (
              <article key={card.titleKey} className="flex flex-col rounded-card border border-border bg-card p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-medium">{t(`HomepagePricing.${card.titleKey}.title`)}</h3>

                  {card.badgeKey ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
                      {t(`HomepagePricing.${card.titleKey}.${card.badgeKey}`)}
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 min-h-12 text-xs leading-relaxed text-muted-foreground">
                  {t(`HomepagePricing.${card.titleKey}.tag`)}
                </p>

                <p className="mt-5">
                  <span className="text-3xl font-medium tracking-tight tabular-nums">
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
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {t(`HomepagePricing.${card.titleKey}.${card.periodKey}`)}
                    </span>
                  ) : null}
                </p>

                <Button asChild className="mt-5 w-full" variant={featured ? "default" : "secondary"}>
                  <AppLink external={card.href.startsWith("http")} href={card.href}>
                    {t(`HomepagePricing.${card.titleKey}.ctaText`)}
                  </AppLink>
                </Button>

                {card.compareHref && card.compareTextKey ? (
                  <AppLink className="mt-3 text-center text-xs text-muted-foreground" href={card.compareHref}>
                    {t(`HomepagePricing.${card.titleKey}.${card.compareTextKey}`)}
                  </AppLink>
                ) : null}

                <ul
                  className="-mx-6 mt-5 divide-y divide-border border-t border-border"
                  data-homepage-rules="full-bleed"
                >
                  {card.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="flex items-start gap-2 px-6 py-3 text-xs leading-relaxed">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.25} />

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
      </div>
    </MarketingSection>
  );
}
