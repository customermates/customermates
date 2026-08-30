import { getTranslations } from "next-intl/server";

import { Faq, FaqItem } from "./faq";
import { AppLink } from "@/components/shared/app-link";
import { MarketingSection } from "./marketing-section";

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
    <MarketingSection className="py-14 sm:py-18 lg:py-20" tone="canvas">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-9 border-b border-border pb-7">
          <p className="text-eyebrow">{t("FAQSection.label")}</p>

          {title ? <h2 className="text-display-sm mt-4">{title}</h2> : null}

          {/* eslint-disable react/jsx-newline */}
          <p className="text-body mt-4 max-w-[64ch] text-subdued">
            {t("FAQSection.contactIntro")}{" "}
            <AppLink appearance="inline" className="font-medium" href="/contact">
              {t("FAQSection.contactCta")}
            </AppLink>
          </p>
          {/* eslint-enable react/jsx-newline */}
        </div>

        <Faq>
          {faqs.map((faq) => (
            <FaqItem key={faq.id} question={faq.title}>
              {faq.content}
            </FaqItem>
          ))}
        </Faq>
      </div>
    </MarketingSection>
  );
}
