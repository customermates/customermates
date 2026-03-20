"use client";

import type { FAQ } from "@/core/fumadocs/schemas/common";

import { XAccordion } from "@/components/x-accordion";
import { XAccordionItem } from "@/components/x-accordion";

type Props = FAQ;

export function XFAQSection({ faqs, title }: Props) {
  return (
    <section className="py-12 md:py-16 w-full">
      <div className="max-w-4xl mx-auto px-4">
        {title && (
          <div className="text-center mb-12">
            <h2 className="text-x-3xl">{title}</h2>
          </div>
        )}

        <XAccordion defaultSelectedKeys={[faqs[0].id]}>
          {faqs.map((faq) =>
            XAccordionItem({
              key: faq.id,
              title: faq.title,
              children: faq.content,
            }),
          )}
        </XAccordion>
      </div>
    </section>
  );
}
