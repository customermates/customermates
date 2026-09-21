"use client";

import type { ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Check, Plus, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CustomColumnType, type EntityType } from "@/generated/prisma";

import { useCustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useEntityDetailCustomization } from "./entity-detail-personalization";
import { EntityDetailFields } from "./entity-detail-fields";

type Props = {
  canManage: boolean;
  columns: CustomColumnDto[];
  entityType: EntityType;
  isEditing: boolean;
  onToggleEditing: () => void;
  fields: { id: string; content: ReactNode }[];
};

export function EntityDetailOverview({ canManage, columns, entityType, isEditing, onToggleEditing, fields }: Props) {
  const t = useTranslations();
  const { customColumnModalStore } = useRootStore();
  const { isCustomizing, onToggleCustomization } = useEntityDetailCustomization({
    canManage,
    isEditingCustomField: isEditing,
    toggleEditingCustomField: onToggleEditing,
  });
  const onAddField = useCallback(() => {
    customColumnModalStore.initialize(CustomColumnType.plain, entityType);
    customColumnModalStore.open();
  }, [customColumnModalStore, entityType]);
  const isEmpty = columns.length === 0;
  const customFields = useCustomFieldInputs({ columns, isEditing, personalizable: true });
  const isTimestamp = (field: { id: string }) => field.id === "createdAt" || field.id === "updatedAt";
  const allFields = [...fields.filter((field) => !isTimestamp(field)), ...customFields, ...fields.filter(isTimestamp)];

  return (
    <div data-entity-overview className="flex min-w-0 flex-col gap-4">
      <EntityDetailFields fields={allFields} />

      {canManage && (isEmpty || isEditing) ? (
        <Button
          data-entity-add-custom-field
          className="w-full"
          id="entity-add-custom-field"
          size="sm"
          type="button"
          variant="default"
          onClick={onAddField}
        >
          <Icon icon={Plus} />

          {t("Common.actions.addCustomField")}
        </Button>
      ) : null}

      {canManage ? (
        <Button
          data-entity-custom-fields-mode-toggle
          aria-label={isCustomizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize")}
          aria-pressed={isCustomizing}
          className="w-full bg-transparent text-muted-foreground shadow-none"
          type="button"
          variant="field"
          onClick={onToggleCustomization}
        >
          <Icon icon={isCustomizing ? Check : Settings2} />

          {isCustomizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize")}
        </Button>
      ) : null}
    </div>
  );
}
