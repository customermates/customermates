import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";

import { XIcon } from "../../x-icon";

import { XCustomFieldEditor } from "./x-custom-field-editor";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useXForm } from "@/components/x-inputs/x-form";

type Props = {
  isEditing: boolean;
  column: CustomColumnDto;
  index: number;
};

export const XCustomFieldValueInput = observer(({ isEditing, column, index }: Props) => {
  const store = useXForm();
  const { xCustomColumnModalStore } = useRootStore();

  const { label } = column;
  const id = `customFieldValues[${index}].value`;
  const value = store?.getValue(id) as string | undefined;

  return (
    <div className={cn("grid", { "grid-cols-[1fr_3.5rem]": isEditing })}>
      <XCustomFieldEditor
        column={column}
        id={id}
        isEditing={isEditing}
        label={label}
        value={value}
        onChange={(nextValue) => store?.onChange(id, nextValue)}
      />

      {isEditing && (
        <Button
          isIconOnly
          className="h-full w-full rounded-l-none"
          color="primary"
          variant="bordered"
          onPress={() => xCustomColumnModalStore.openWithColumn(column)}
        >
          <XIcon icon={PencilIcon} />
        </Button>
      )}
    </div>
  );
});
