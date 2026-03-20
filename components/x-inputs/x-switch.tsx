import type { SwitchProps } from "@heroui/switch";

import { Switch } from "@heroui/switch";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useXForm } from "./x-form";

type Props = SwitchProps & { id: string };

export const XSwitch = observer(({ id, children, ...props }: Props) => {
  const t = useTranslations("Common.inputs");

  const store = useXForm();
  const isSelected = store?.getValue(id) as boolean | undefined;
  const isDisabled = store?.isDisabled;

  const defaultProps: SwitchProps = {
    id,
    size: "sm",
    isDisabled,
    isSelected,
    onValueChange: (value: boolean) => store?.onChange(id, value),
    children: children === null ? undefined : (children ?? t(id)),
    ...props,
  };

  return <Switch {...defaultProps} />;
});
