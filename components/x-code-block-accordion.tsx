"use client";

import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { Accordion, AccordionItem } from "@heroui/accordion";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";

import { XIcon } from "./x-icon";

type Props = {
  title: string;
  code: string;
  lang?: string;
};

export function XCodeBlockAccordion({ title, code, lang = "json" }: Props) {
  return (
    <Accordion
      className="p-0 border-t border-divider"
      defaultSelectedKeys={[]}
      itemClasses={{
        trigger: "p-0 pt-4",
        title: "text-xs font-semibold text-subdued uppercase",
      }}
    >
      <AccordionItem
        key="codeBlock"
        indicator={() => <XIcon className="text-foreground" icon={ChevronLeftIcon} />}
        title={title}
      >
        <div className="**:[[role=region]]:max-h-none! pt-4">
          <DynamicCodeBlock code={code} lang={lang} />
        </div>
      </AccordionItem>
    </Accordion>
  );
}
