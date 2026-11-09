import type { FAQItem as FAQItemContent } from "@/core/fumadocs/schemas/common";

import { FAQSection } from "@/components/marketing/faq-section";

type Props = {
  faqs: FAQItemContent[];
  title?: string;
};

export function PricingFaqSection({ faqs, title }: Props) {
  return <FAQSection faqs={faqs} title={title} />;
}
