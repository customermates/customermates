"use client";

import { observer } from "mobx-react-lite";

import { useAppForm } from "@/components/forms/form-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";

type Props = {
  id: string;
  isValidFilter: boolean;
};

export const FilterInputText = observer(({ id, isValidFilter }: Props) => {
  const store = useAppForm();
  const value = (store?.getValue(id) as string | number | undefined) ?? "";

  return (
    <Input
      className={cn("h-full", isValidFilter ? "border-primary bg-primary/10" : "border-input")}
      disabled={store?.isDisabled}
      id={id}
      value={value}
      onChange={(event) => store?.onChange(id, event.target.value)}
    />
  );
});
