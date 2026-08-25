import type { ReactElement, ReactNode } from "react";

import { Children, isValidElement } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { faqPageSchema } from "@/core/seo/schemas";

type FaqItemProps = {
  children: ReactNode;
  question: string;
};

function plainText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement(node)) return plainText((node.props as { children?: ReactNode }).children);
  return "";
}

function faqItemsOf(children: ReactNode): FaqItemProps[] {
  return Children.toArray(children)
    .filter((child): child is ReactElement<FaqItemProps> => isValidElement(child) && "question" in (child.props ?? {}))
    .map((child) => child.props);
}

export function FaqItem({ children, question }: FaqItemProps) {
  return (
    <AccordionItem className="rounded-xl border border-border bg-card px-2 last:border-b" value={question}>
      <AccordionTrigger className="text-x-lg px-4 py-5 text-left">{question}</AccordionTrigger>

      <AccordionContent className="text-x-lg px-4 pb-5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export function Faq({ children }: { children: ReactNode }) {
  const items = faqItemsOf(children);

  if (items.length === 0) return null;

  return (
    <>
      <JsonLd
        schema={faqPageSchema(
          items.map((item) => ({ answer: plainText(item.children).trim(), question: item.question })),
        )}
      />

      <Accordion collapsible className="not-prose flex flex-col gap-3" defaultValue={items[0].question} type="single">
        {children}
      </Accordion>
    </>
  );
}
