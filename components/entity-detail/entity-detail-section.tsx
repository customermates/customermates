"use client";

import type { ReactNode } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/core/utils/cn";

import { useEntityDetailPersonalization } from "./entity-detail-personalization";

type Props = {
  sectionId: string;
  label: string;
  children: ReactNode;
  className?: string;
};

type GroupProps = Pick<Props, "children" | "className">;

export function EntityDetailSectionGroup({ children, className }: GroupProps) {
  const { openSectionId, setOpenSection } = useEntityDetailPersonalization();

  return (
    <Accordion
      collapsible
      data-detail-section-group
      className={cn("-mx-4 -mt-4 flex w-auto flex-col", className)}
      type="single"
      value={openSectionId ?? ""}
      onValueChange={(sectionId) => setOpenSection(sectionId || undefined)}
    >
      {children}
    </Accordion>
  );
}

export function EntityDetailSection({ sectionId, label, children, className }: Props) {
  return (
    <AccordionItem
      className={cn("w-full border-border last:border-b", className)}
      data-detail-section={sectionId}
      value={sectionId}
    >
      <AccordionTrigger
        className="group w-full cursor-pointer items-center gap-4 rounded-none p-4 text-left text-sm font-medium outline-none transition-colors hover:bg-accent hover:no-underline focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 [&_svg]:motion-reduce:transition-none"
        data-detail-section-trigger={sectionId}
      >
        <span className="text-sm font-medium text-foreground/85 transition-colors group-hover:text-foreground motion-reduce:transition-none">
          {label}
        </span>
      </AccordionTrigger>

      <AccordionContent className="flex flex-col gap-4 px-4 pb-4" data-detail-section-content={sectionId}>
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
