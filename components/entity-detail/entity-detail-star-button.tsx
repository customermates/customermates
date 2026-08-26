"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconButton } from "@/components/ui/icon-button";
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
    <IconButton
      fieldAction
      className={className}
      icon={Star}
      iconClassName={cn(starred && "fill-current text-primary")}
      label={actionLabel}
      pressed={starred}
      onClick={() => toggleStarredField(fieldId)}
    />
  );
}
