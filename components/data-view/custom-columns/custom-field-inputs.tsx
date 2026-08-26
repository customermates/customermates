import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";
import { EntityDetailStarButton } from "@/components/entity-detail/entity-detail-star-button";
import { IconButton } from "@/components/ui/icon-button";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { resolveOrderedCustomColumns } from "@/components/entity-detail/entity-detail-personalization.utils";

type Props = {
  columns: CustomColumnDto[];
  isEditing: boolean;
  personalizable?: boolean;
};

export function CustomFieldInputs({ columns, isEditing, personalizable = false }: Props) {
  const t = useTranslations();
  const { columnOrder, isPersonalizing, moveColumn } = useEntityDetailPersonalization();
  const orderedColumns = personalizable
    ? resolveOrderedCustomColumns(columns, columnOrder)
    : columns.map((column, formIndex) => ({ column, formIndex }));

  return (
    <>
      {orderedColumns.map(({ column, formIndex }, visualIndex) => (
        <CustomFieldValueInput
          key={column.id}
          column={column}
          index={formIndex}
          isEditing={isEditing}
          labelEndAddon={
            personalizable ? (
              <span className="flex items-center gap-0.5">
                <EntityDetailStarButton fieldId={column.id} label={column.label} />

                {isPersonalizing && (
                  <>
                    <IconButton
                      className="size-5"
                      disabled={visualIndex === 0}
                      icon={ArrowUp}
                      label={t("EntityDetail.moveFieldUp", {
                        field: column.label,
                      })}
                      onClick={() => moveColumn(column.id, "up")}
                    />

                    <IconButton
                      className="size-5"
                      disabled={visualIndex === orderedColumns.length - 1}
                      icon={ArrowDown}
                      label={t("EntityDetail.moveFieldDown", {
                        field: column.label,
                      })}
                      onClick={() => moveColumn(column.id, "down")}
                    />
                  </>
                )}
              </span>
            ) : undefined
          }
        />
      ))}
    </>
  );
}
