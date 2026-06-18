import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";

type Props = {
  columns: CustomColumnDto[];
  isEditing: boolean;
};

export function CustomFieldInputs({ columns, isEditing }: Props) {
  return (
    <>
      {columns.map((column, index) => (
        <CustomFieldValueInput key={column.id} column={column} index={index} isEditing={isEditing} />
      ))}
    </>
  );
}
