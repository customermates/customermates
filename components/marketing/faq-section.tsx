import { getTranslations } from "next-intl/server";

import { Faq, FaqItem } from "./faq";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { AppLink } from "@/components/shared/app-link";

type FAQItem = {
  content: string;
  id: string;
  title: string;
};

type Props = {
  faqs: FAQItem[];
  title?: string;
};

export async function FAQSection({ faqs, title }: Props) {
  if (!faqs.length) return null;

  const t = await getTranslations();

  return (
    <MarketingSection id="faq" title={title ?? t("FAQSection.label")}>
      <div className="mx-auto mt-10 max-w-3xl lg:mt-12">
        <Faq>
          {faqs.map((faq) => (
            <FaqItem key={faq.id} question={faq.title}>
              {faq.content}
            </FaqItem>
          ))}
        </Faq>

        {/* eslint-disable react/jsx-newline */}
        <p className="text-meta mt-6">
          {t("FAQSection.contactIntro")}{" "}
          <AppLink appearance="inline" className="font-medium" href="/contact">
            {t("FAQSection.contactCta")}
          </AppLink>
        </p>
        {/* eslint-enable react/jsx-newline */}
      </div>
    </MarketingSection>
  );
}
