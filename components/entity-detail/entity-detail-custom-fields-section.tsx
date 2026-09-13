"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Pencil, Plus, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CustomColumnType, type EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { DataViewEmptyState } from "@/components/data-view/data-view-empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useEntityDetailCustomization } from "./entity-detail-personalization";
import { EntityDetailSection } from "./entity-detail-section";

type Props = {
  canManage: boolean;
  columns: CustomColumnDto[];
  entityType: EntityType;
  isEditing: boolean;
  onToggleEditing: () => void;
  sectionId: string;
};

export function EntityDetailCustomFieldsSection({
  canManage,
  columns,
  entityType,
  isEditing,
  onToggleEditing,
  sectionId,
}: Props) {
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

  return (
    <EntityDetailSection label={t("EntityDetail.sections.customFields")} sectionId={sectionId}>
      {isEmpty ? (
        <DataViewEmptyState
          body={t("EntityDetail.customFieldsEmpty.body")}
          icon={SlidersHorizontal}
          title={t("EntityDetail.customFieldsEmpty.title")}
        />
      ) : (
        <CustomFieldInputs personalizable columns={columns} isEditing={isEditing} />
      )}

      {canManage && (isEmpty || isEditing) ? (
        <Button
          data-entity-add-custom-field
          className={isEmpty ? "self-center" : "w-full"}
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
          aria-label={isCustomizing ? t("Common.actions.cancel") : t("Common.actions.editCustomFields")}
          aria-pressed={isCustomizing}
          className="w-full text-muted-foreground"
          type="button"
          variant="field"
          onClick={onToggleCustomization}
        >
          <Icon icon={isCustomizing ? X : Pencil} />

          {isCustomizing ? t("Common.actions.cancel") : t("Common.actions.editCustomFields")}
        </Button>
      ) : null}
    </EntityDetailSection>
  );
}
