import type { FAQItem } from "@/core/fumadocs/schemas/common";

import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Faq, FaqItem } from "@/components/marketing/faq";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";

type FaqProps = {
  faqs: FAQItem[];
  title?: string;
};

type ClosingProps = {
  action: string;
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  description: string;
  eyebrow: string;
  hint: string;
};

export async function HomepageFaq({ faqs, title }: FaqProps) {
  const t = await getTranslations();
  if (faqs.length === 0) return null;

  return (
    <MarketingSection id="faq">
      <div className="marketing-grid gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{t("FAQSection.label")}</p>

          {title ? <h2 className="text-display-sm mt-5">{title}</h2> : null}

          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {/* eslint-disable react/jsx-newline */}
            {t("FAQSection.contactIntro")}{" "}
            <AppLink appearance="inline" className="font-medium text-foreground" href="/contact">
              {t("FAQSection.contactCta")}
            </AppLink>
            {/* eslint-enable react/jsx-newline */}
          </p>
        </div>

        <div className="col-span-12 lg:col-start-6 lg:col-end-13">
          <Faq>
            {faqs.map((faq) => (
              <FaqItem key={faq.id} question={faq.title}>
                {faq.content}
              </FaqItem>
            ))}
          </Faq>
        </div>
      </div>
    </MarketingSection>
  );
}

export function HomepageClosing({
  action,
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  description,
  eyebrow,
  hint,
}: ClosingProps) {
  return (
    <MarketingSection flush id="get-started">
      <div className="rounded-card border border-border bg-sidebar px-5 py-14 text-center sm:px-10 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-eyebrow">{eyebrow}</p>

          <h2 className="text-display-sm mt-5">{action}</h2>

          <p className="text-lede mx-auto mt-5">{description}</p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <AppLink href={buttonLeftHref}>
                {buttonLeftText}

                <ArrowUpRight aria-hidden className="size-4" />
              </AppLink>
            </Button>

            <Button asChild size="lg" variant="secondary">
              <AppLink external={buttonRightHref.startsWith("http")} href={buttonRightHref}>
                {buttonRightText}
              </AppLink>
            </Button>
          </div>

          <p className="text-meta mt-5">{hint}</p>
        </div>
      </div>
    </MarketingSection>
  );
}
