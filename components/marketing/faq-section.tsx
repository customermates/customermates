"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type FAQItem = {
  content: string;
  id: string;
  title: string;
};

type Props = {
  faqs: FAQItem[];
  title?: string;
};

export function FAQSection({ faqs, title }: Props) {
  if (!faqs.length) return null;

  return (
    <section className="relative w-full py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4">
        {title ? (
          <div className="mb-12 text-center">
            <h2 className="text-x-3xl">{title}</h2>
          </div>
        ) : null}

        <Accordion collapsible className="flex flex-col gap-3" defaultValue={faqs[0].id} type="single">
          {faqs.map((faq) => (
            <AccordionItem key={faq.id} className="rounded-xl border-b-0 bg-card px-2" value={faq.id}>
              <AccordionTrigger className="text-x-lg px-4 py-5">{faq.title}</AccordionTrigger>

              <AccordionContent className="text-x-lg px-4 pb-5">{faq.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
