"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Plus, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { CustomColumnType, type EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { DataViewEmptyState } from "@/components/data-view/data-view-empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";

import { EntityDetailSection } from "./entity-detail-section";

type Props = {
  canManage: boolean;
  columns: CustomColumnDto[];
  entityType: EntityType;
  isEditing: boolean;
  sectionId: string;
};

export function EntityDetailCustomFieldsSection({ canManage, columns, entityType, isEditing, sectionId }: Props) {
  const t = useTranslations();
  const { customColumnModalStore } = useRootStore();
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
    </EntityDetailSection>
  );
}
