"use client";

import type { InputProps } from "@heroui/input";

import { Input } from "@heroui/input";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useXForm } from "./x-form";

type Props = InputProps & { id: string };

export const XInput = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();

  const errorMessage = store?.getError(id);

  const defaultProps: InputProps = {
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
    value: store?.getValue(id) as string | undefined,
    onValueChange: (val: string) => store?.onChange(id, val),
    ...props,
  };

  return <Input {...defaultProps} />;
});
