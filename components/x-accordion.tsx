import type { AccordionItemProps, AccordionProps } from "@heroui/accordion";

import { Accordion, AccordionItem } from "@heroui/accordion";

export function XAccordion(props: AccordionProps) {
  return <Accordion {...props} className={`p-0 gap-5 ${props.className}`} variant="splitted" />;
}

export function XAccordionItem({ key, ...props }: AccordionItemProps) {
  return (
    <AccordionItem
      key={key}
      {...props}
      classNames={{
        base: `${props.className} shadow-small`,
        title: "text-x-lg",
        content: "text-x-lg",
      }}
    />
  );
}
