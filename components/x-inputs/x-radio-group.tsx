import type { RadioGroupProps } from "@heroui/radio";

import React from "react";
import { RadioGroup } from "@heroui/radio";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useXForm } from "./x-form";

type Props = RadioGroupProps & {
  id: string;
};

export const XRadioGroup = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const isDisabled = store?.isDisabled;
  const errorMessage = store?.getError(id);
  const value = store?.getValue(id) as string | undefined;

  const defaultProps: RadioGroupProps = {
    isDisabled,
    isInvalid: Boolean(errorMessage),
    label: label === null ? undefined : (label ?? t(id)),
    orientation: "horizontal",
    size: "sm",
    errorMessage: (
      <ul>
        {[errorMessage].flat().map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    ),
    value,
    onValueChange: (value) => store?.onChange(id, value),
    ...props,
  };

  return <RadioGroup {...defaultProps} />;
});
