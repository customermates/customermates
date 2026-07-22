"use client";

import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/core/utils/cn";

type Props = {
  title: string;
  code: string;
  lang?: string;
  className?: string;
};

export function CodeBlockAccordion({ title, code, lang = "json", className }: Props) {
  return (
    <Accordion collapsible className={cn("border-t", className)} type="single">
      <AccordionItem className="border-b-0" value="codeBlock">
        <AccordionTrigger className="py-4 text-xs font-semibold uppercase text-muted-foreground hover:no-underline">
          {title}
        </AccordionTrigger>

        <AccordionContent className="pt-4 **:[[role=region]]:max-h-none!">
          <DynamicCodeBlock code={code} lang={lang} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
