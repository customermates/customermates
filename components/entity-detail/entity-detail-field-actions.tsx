"use client";

import { Eye, EyeOff, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/core/utils/cn";

import { useEntityDetailPersonalization } from "./entity-detail-personalization";
import { EntityDetailPinButton } from "./entity-detail-pin-button";

type Props = {
  fieldId: string;
  label: string;
  className?: string;
};

export function EntityDetailFieldActions({ fieldId, label, className }: Props) {
  const t = useTranslations();
  const {
    enabled,
    hiddenFieldIds = [],
    isPersonalizing = false,
    toggleFieldVisibility = () => undefined,
    fieldSettingsHref,
  } = useEntityDetailPersonalization();
  const hidden = hiddenFieldIds.includes(fieldId);
  const settingsHref = isPersonalizing ? fieldSettingsHref?.(fieldId) : null;

  if (!enabled) return null;

  return (
    <span className={cn("flex items-center gap-0.5", className)}>
      <EntityDetailPinButton fieldId={fieldId} label={label} />

      {isPersonalizing ? (
        <IconButton
          fieldAction
          className="size-5"
          icon={hidden ? EyeOff : Eye}
          iconClassName={cn(hidden && "text-primary")}
          label={hidden ? t("EntityDetail.showField", { field: label }) : t("EntityDetail.hideField", { field: label })}
          pressed={hidden}
          onClick={() => toggleFieldVisibility(fieldId)}
        />
      ) : null}

      {settingsHref ? (
        <IconButton
          fieldAction
          className="size-5"
          href={settingsHref}
          icon={Pencil}
          label={t("EntityDetail.configureField", { field: label })}
        />
      ) : null}
    </span>
  );
}
