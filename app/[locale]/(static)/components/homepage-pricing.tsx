import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { WaveDecoration } from "@/components/marketing/wave-decoration";

type CardConfig = {
  href: string;
  badgeKey?: string;
  periodKey?: string;
  titleKey: "selfHosted" | "cloud";
  variant: "outline" | "default";
  featureKeys: string[];
};

const CARDS: CardConfig[] = [
  {
    titleKey: "selfHosted",
    href: "https://github.com/customermates/customermates",
    periodKey: "period",
    variant: "outline",
    featureKeys: ["featureUsers", "featureRecords", "featureApi", "featureN8n", "featureCommunity"],
  },
  {
    titleKey: "cloud",
    href: "/auth/signup",
    badgeKey: "badge",
    periodKey: "period",
    variant: "default",
    featureKeys: ["featureEverything", "featureAudit", "featureSso", "featurePriority", "featureMcp"],
  },
];

const COMPARE_KEYS = ["gdpr", "noLimits", "openSource", "cancelAnytime"] as const;

export async function HomepagePricing() {
  const t = await getTranslations();

  return (
    <section className="relative isolate w-full overflow-hidden py-20 md:py-28" id="pricing">
      <WaveDecoration className="-top-10 -left-32 w-[min(560px,70%)] -scale-x-100" opacity={0.4} variant="wave-1" />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[10%] top-[20%] size-[360px] rounded-full bg-[rgba(94,74,227,0.18)] blur-[80px]" />

        <div className="absolute right-[8%] bottom-[10%] size-[320px] rounded-full bg-[rgba(18,148,144,0.15)] blur-[80px]" />

        <div
          className="absolute inset-0 opacity-[0.35] bg-[radial-gradient(circle_at_1px_1px,rgba(94,74,227,0.12)_1px,transparent_0)] bg-size-[24px_24px]"
          style={{
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 85%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 85%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[820px] px-4">
        <div className="relative mb-10 text-center">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-mono text-[12px] font-medium uppercase tracking-[0.05em] text-primary">
            <span className="size-[5px] rounded-full bg-primary" style={{ boxShadow: "0 0 8px var(--primary)" }} />

            {t("HomepagePricing.eyebrow")}
          </span>

          <h2 className="text-x-3xl pb-4">{t("HomepagePricing.title")}</h2>

          <p className="mx-auto max-w-[560px] text-x-lg text-subdued">{t("HomepagePricing.subtitle")}</p>

          <svg
            aria-hidden
            className="absolute -top-2 left-[calc(50%-220px)] size-4 text-primary opacity-45"
            fill="none"
            viewBox="0 0 16 16"
          >
            <path d="M8 0v16M0 8h16" stroke="currentColor" strokeWidth="1" />
          </svg>

          <svg
            aria-hidden
            className="absolute -top-2 right-[calc(50%-220px)] size-4 text-primary opacity-45"
            fill="none"
            viewBox="0 0 16 16"
          >
            <path d="M8 0v16M0 8h16" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CARDS.map((card) => {
            const featured = card.variant === "default";
            return (
              <div
                key={card.titleKey}
                className={`relative flex flex-col rounded-xl bg-card p-6 shadow-xs ${
                  featured ? "border-2 border-primary" : ""
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="m-0 text-[19px] font-semibold">{t(`HomepagePricing.${card.titleKey}.title`)}</h3>

                  {card.badgeKey && (
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {t(`HomepagePricing.${card.titleKey}.${card.badgeKey}`)}
                    </span>
                  )}
                </div>

                <p className="m-0 min-h-[40px] text-[13px] leading-[1.55] text-muted-foreground">
                  {t(`HomepagePricing.${card.titleKey}.tag`)}
                </p>

                <div className="my-4">
                  <span className="text-[34px] font-bold tracking-[-0.02em]">
                    {t(`HomepagePricing.${card.titleKey}.price`)}
                  </span>

                  {card.periodKey && (
                    <span className="ml-1.5 text-[13px] text-muted-foreground">
                      {t(`HomepagePricing.${card.titleKey}.${card.periodKey}`)}
                    </span>
                  )}
                </div>

                <Button asChild className="w-full" variant={featured ? "default" : "outline"}>
                  <AppLink external={card.href.startsWith("http")} href={card.href}>
                    {t(`HomepagePricing.${card.titleKey}.ctaText`)}
                  </AppLink>
                </Button>

                <ul className="m-0 mt-4 flex flex-col gap-2 p-0">
                  {card.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="flex items-start gap-2 text-[13px] text-foreground">
                      <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={2.5} />

                      <span>{t(`HomepagePricing.${card.titleKey}.${featureKey}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-8 flex max-w-[820px] flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
          {COMPARE_KEYS.map((key, i) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="opacity-30">|</span>}

              <span className="inline-flex items-center gap-1.5">
                <span className="text-[#34c759]">✓</span>

                {t(`HomepagePricing.compare.${key}`)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
