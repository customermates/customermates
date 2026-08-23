import { getTranslations } from "next-intl/server";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AppLink } from "@/components/shared/app-link";
import { FAQAnswer } from "@/components/marketing/faq-answer";

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
    <MarketingSection alignBody eyebrow={t("FAQSection.label")} id="faq" title={title}>
      <div className="mt-10 lg:mt-12">
        <Accordion collapsible className="flex flex-col gap-3" defaultValue={faqs[0].id} type="single">
          {faqs.map((faq) => (
            <AccordionItem
              key={faq.id}
              className="rounded-card border border-border bg-card px-2 last:border-b"
              value={faq.id}
            >
              <AccordionTrigger className="px-4 py-5 text-base font-medium">{faq.title}</AccordionTrigger>

              <AccordionContent forceMount className="px-4 pb-5 text-sm leading-relaxed text-muted-foreground">
                <FAQAnswer content={faq.content} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

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
