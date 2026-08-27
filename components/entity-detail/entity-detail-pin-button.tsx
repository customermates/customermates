"use client";

import { Pin } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/core/utils/cn";

import { useEntityDetailPersonalization } from "./entity-detail-personalization";

type Props = {
  fieldId: string;
  label: string;
  className?: string;
};

export function EntityDetailPinButton({ fieldId, label, className }: Props) {
  const t = useTranslations();
  const { enabled, starredFieldIds, toggleStarredField } = useEntityDetailPersonalization();
  const pinned = starredFieldIds.includes(fieldId);

  if (!enabled) return null;

  const actionLabel = pinned
    ? t("EntityDetail.unpinField", { field: label })
    : t("EntityDetail.pinField", { field: label });

  return (
    <IconButton
      fieldAction
      className={className}
      icon={Pin}
      iconClassName={cn(pinned && "fill-current text-primary")}
      label={actionLabel}
      pressed={pinned}
      onClick={() => toggleStarredField(fieldId)}
    />
  );
}
