import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { resolveOrderedCustomColumns } from "@/components/entity-detail/entity-detail-personalization.utils";

type Props = {
  columns: CustomColumnDto[];
  isEditing: boolean;
  personalizable?: boolean;
};

export function useCustomFieldInputs({ columns, isEditing, personalizable = false }: Props) {
  const { columnOrder, enabled } = useEntityDetailPersonalization();
  const orderedColumns = enabled
    ? resolveOrderedCustomColumns(columns, columnOrder)
    : columns.map((column, formIndex) => ({ column, formIndex }));
  return orderedColumns.map(({ column, formIndex }) => ({
    id: column.id,
    content: (
      <EntityDetailField key={column.id} fieldId={column.id}>
        <CustomFieldValueInput
          column={column}
          controlStartAddon={personalizable ? <EntityDetailFieldDragHandle label={column.label} /> : undefined}
          index={formIndex}
          isEditing={isEditing}
          labelEndAddon={
            personalizable ? <EntityDetailFieldActions fieldId={column.id} label={column.label} /> : undefined
          }
        />
      </EntityDetailField>
    ),
  }));
}

export function CustomFieldInputs(props: Props) {
  const fields = useCustomFieldInputs(props);
  return <>{fields.map((field) => field.content)}</>;
}
