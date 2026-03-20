import type { SelectProps } from "@heroui/select";
import type { SharedSelection } from "@heroui/system-rsc";

import { Select } from "@heroui/select";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useXForm } from "./x-form";

type Identifiable =
  | {
      id: string;
    }
  | {
      key: string;
    }
  | {
      value: string;
    };

export type XSelectProps<T extends Identifiable> = SelectProps<T> & {
  id: string;
};

export const XSelect = observer(<T extends Identifiable>({ id, label, ...props }: XSelectProps<T>) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const isDisabled = store?.isDisabled;
  const errorMessage = store?.getError(id);
  const value = props.value ?? (store?.getValue(id) as string | string[] | undefined);
  const selectedKeys = Array.isArray(value)
    ? new Set<string>(value)
    : value !== undefined
      ? new Set<string>([String(value)])
      : new Set<string>();

  function keyOf(item: T) {
    return "key" in item ? item.key : "value" in item ? item.value : item.id;
  }

  function onSelectionChange(selection: SharedSelection) {
    if (selection === "all") {
      const items = Array.from(props.items ?? []);
      store?.onChange(
        id,
        items.map((item) => keyOf(item)),
      );
      return;
    }

    const keys = Array.from(selection).map((k) => String(k));
    const value = props.selectionMode === "multiple" ? keys : (keys[0] ?? undefined);
    store?.onChange(id, value);
  }

  const defaultProps: SelectProps<T> = {
    id,
    label: label === null ? undefined : (label ?? t(id)),
    variant: "bordered",
    placeholder: " ",
    isDisabled,
    isInvalid: Boolean(errorMessage),
    errorMessage: (
      <ul>
        {[errorMessage].flat().map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    ),
    listboxProps: {
      emptyContent: t("emptyContent"),
      ...props.listboxProps,
    },
    onSelectionChange,
    selectedKeys,
    ...props,
  };

  return <Select {...defaultProps} />;
});
