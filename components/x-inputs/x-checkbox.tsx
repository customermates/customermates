import type { CheckboxProps } from "@heroui/checkbox";

import { Checkbox } from "@heroui/checkbox";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useXForm } from "./x-form";

type Props = CheckboxProps & { id: string };

export const XCheckbox = observer(({ id, children, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const errorMessage = store?.getError(id);
  const value = store?.getValue(id) as boolean | undefined;

  const defaultProps: CheckboxProps = {
    isDisabled: store?.isDisabled,
    isInvalid: Boolean(errorMessage),
    isSelected: value,
    size: "sm",
    onValueChange: (value) => store?.onChange(id, value),
    children: children === null ? undefined : (children ?? t(id)),
    ...props,
  };

  return <Checkbox {...defaultProps} />;
});
