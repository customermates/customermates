import type { FAQItem as FAQItemContent } from "@/core/fumadocs/schemas/common";

import { getTranslations } from "next-intl/server";

import { Faq, FaqItem } from "@/components/marketing/faq";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppLink } from "@/components/shared/app-link";

type Props = {
  faqs: FAQItemContent[];
  title?: string;
};

export async function PricingFaqSection({ faqs, title }: Props) {
  if (faqs.length === 0) return null;

  const t = await getTranslations();

  return (
    <MarketingSection className="py-16 sm:py-20 lg:py-24" id="faq">
      <div className="marketing-grid gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          <p className="text-eyebrow">{t("FAQSection.label")}</p>

          {title ? <h2 className="text-display-sm mt-5">{title}</h2> : null}

          <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">
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
