"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";

import { useEntityDetailPersonalization } from "./entity-detail-personalization";

type Props = {
  fieldId: string;
  label: string;
  className?: string;
};

export function EntityDetailStarButton({ fieldId, label, className }: Props) {
  const t = useTranslations();
  const { enabled, starredFieldIds, toggleStarredField } = useEntityDetailPersonalization();
  const starred = starredFieldIds.includes(fieldId);

  if (!enabled) return null;

  const actionLabel = starred
    ? t("EntityDetail.unstarField", { field: label })
    : t("EntityDetail.starField", { field: label });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={actionLabel}
          aria-pressed={starred}
          className={cn("size-5 text-muted-foreground hover:text-foreground", className)}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => toggleStarredField(fieldId)}
        >
          <Star className={cn("size-3.5", starred && "fill-current text-primary")} />
        </Button>
      </TooltipTrigger>

      <TooltipContent>{actionLabel}</TooltipContent>
    </Tooltip>
  );
}
