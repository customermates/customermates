"use client";

import type { NumberInputProps } from "@heroui/number-input";

import { NumberInput } from "@heroui/number-input";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useXForm } from "./x-form";

type Props = NumberInputProps & {
  id: string;
};

export const XInputNumber = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const errorMessage = store?.getError(id);

  const defaultProps: NumberInputProps = {
    id,
    variant: "bordered",
    label: label === null ? undefined : (label ?? t(id)),
    placeholder: " ",
    isDisabled: store?.isDisabled,
    isInvalid: Boolean(errorMessage),
    errorMessage: (
      <ul>
        {[errorMessage].flat().map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    ),
    value: store?.getValue(id) as number | undefined,
    formatOptions: {
      maximumFractionDigits: 2,
      useGrouping: true,
    },
    onValueChange: (val: number) => store?.onChange(id, isNaN(val) ? undefined : val),
    ...props,
  };

  return <NumberInput {...defaultProps} />;
});
