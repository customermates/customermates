import { getTranslations } from "next-intl/server";

import { AppLink } from "@/components/shared/app-link";

import { Faq, FaqItem } from "./faq";
import { MarketingSection } from "./marketing-section";
import { SectionHeader } from "./section-header";

type FAQItem = {
  content: string;
  id: string;
  title: string;
};

type Props = {
  faqs: FAQItem[];
  showHeader?: boolean;
  title?: string;
};

export async function FAQSection({ faqs, showHeader = true, title }: Props) {
  if (!faqs.length) return null;

  const t = await getTranslations();

  return (
    <MarketingSection className={showHeader ? "mk-section" : "mk-section-tight pt-0"} id="faq">
      {showHeader ? <SectionHeader eyebrow={t("FAQSection.label")} title={title ?? t("FAQSection.title")} /> : null}

      <div className="mx-auto max-w-[48rem]">
        <Faq>
          {faqs.map((faq) => (
            <FaqItem key={faq.id} question={faq.title}>
              {faq.content}
            </FaqItem>
          ))}
        </Faq>

        <p className="mt-8 text-center text-sm leading-relaxed text-muted-foreground">
          {/* eslint-disable react/jsx-newline */}
          {t("FAQSection.contactIntro")}{" "}
          <AppLink appearance="inline" className="font-medium text-foreground" href="/contact">
            {t("FAQSection.contactCta")}
          </AppLink>
          {/* eslint-enable react/jsx-newline */}
        </p>
      </div>
    </MarketingSection>
  );
}
