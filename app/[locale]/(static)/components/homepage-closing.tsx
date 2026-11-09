import type { FAQItem } from "@/core/fumadocs/schemas/common";

import { CTASection } from "@/components/marketing/cta-section";
import { FAQSection } from "@/components/marketing/faq-section";

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

export function HomepageFaq({ faqs, title }: FaqProps) {
  return <FAQSection faqs={faqs} title={title} />;
}

export function HomepageClosing(props: ClosingProps) {
  return <CTASection {...props} id="get-started" />;
}
