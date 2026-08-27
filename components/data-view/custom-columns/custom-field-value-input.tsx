import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ReactNode } from "react";

import { Pencil } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { CustomFieldEditor } from "./custom-field-editor";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { FormLabel } from "@/components/forms/form-label";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useAppForm } from "@/components/forms/form-context";

type Props = {
  isEditing: boolean;
  column: CustomColumnDto;
  index: number;
  labelStartAddon?: ReactNode;
  labelEndAddon?: ReactNode;
};

export const CustomFieldValueInput = observer(({ isEditing, column, index, labelStartAddon, labelEndAddon }: Props) => {
  const t = useTranslations();
  const store = useAppForm();
  const { customColumnModalStore } = useRootStore();

  const { label } = column;
  const id = `customFieldValues[${index}].value`;
  const labelId = `${id}-label`;
  const value = store?.getValue(id) as string | undefined;

  const fieldLabel = label && (
    <div className="flex items-center gap-1.5">
      <FormLabel className="flex items-center gap-1.5" htmlFor={id} id={labelId}>
        {labelStartAddon}

        {label}
      </FormLabel>

      {labelEndAddon}
    </div>
  );

  if (!isEditing) {
    return (
      <div className="space-y-1.5">
        {fieldLabel}

        <CustomFieldEditor
          hideLabel
          ariaLabelledBy={label ? labelId : undefined}
          column={column}
          id={id}
          label={label}
          value={value}
          onChange={(nextValue) => store?.onChange(id, nextValue)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {fieldLabel}

      <div className="flex items-end gap-1.5">
        <div className="flex-1 min-w-0 [&_.space-y-1\.5>*]:mb-0!">
          <CustomFieldEditor
            hideLabel
            ariaLabelledBy={label ? labelId : undefined}
            column={column}
            id={id}
            label={label}
            value={value}
            onChange={(nextValue) => store?.onChange(id, nextValue)}
          />
        </div>

        <Button
          aria-label={t("DataView.editColumn")}
          className="size-9 shrink-0"
          size="icon"
          type="button"
          variant="default"
          onClick={() => customColumnModalStore.openWithColumn(column)}
        >
          <Icon icon={Pencil} />
        </Button>
      </div>
    </div>
  );
});
