"use client";

import type { ReactNode } from "react";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  return (
    <div data-detail-section-group className={cn("-mx-4 -mt-4 flex w-auto flex-col", className)}>
      {children}
    </div>
  );
}

export function EntityDetailSection({ sectionId, label, children, className }: Props) {
  const t = useTranslations();
  const { collapsedSectionIds, setSectionCollapsed } = useEntityDetailPersonalization();
  const open = !collapsedSectionIds.includes(sectionId);

  return (
    <Collapsible
      className={cn("w-full border-b border-border", className)}
      data-detail-section={sectionId}
      open={open}
      onOpenChange={(nextOpen) => setSectionCollapsed(sectionId, !nextOpen)}
    >
      <CollapsibleTrigger
        aria-label={
          open
            ? t("EntityDetail.collapseSection", { section: label })
            : t("EntityDetail.expandSection", { section: label })
        }
        className="group flex w-full cursor-pointer items-center gap-4 rounded-none p-4 text-left text-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
        data-detail-section-trigger={sectionId}
        type="button"
      >
        <span className="text-sm font-medium text-foreground/85">{label}</span>

        <ChevronDown
          aria-hidden
          className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-4 px-4 pb-4" data-detail-section-content={sectionId}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
