import type { TextAreaProps } from "@heroui/input";

import { Textarea } from "@heroui/input";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useXForm } from "./x-form";

type Props = TextAreaProps & { id: string };

export const XTextarea = observer(({ id, label, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const errorMessage = store?.getError(id);
  const value = store?.getValue(id) as string | undefined;
  const isDisabled = store?.isDisabled;

  const defaultProps: TextAreaProps = {
    id,
    label: label === null ? undefined : (label ?? t(id)),
    value,
    errorMessage: (
      <ul>
        {[errorMessage].flat().map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    ),
    variant: "bordered",
    isInvalid: Boolean(errorMessage),
    isDisabled,
    placeholder: " ",
    onValueChange: (val: string) => store?.onChange(id, val),
    ...props,
  };

  return <Textarea {...defaultProps} />;
});
