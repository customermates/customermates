"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";

import { useAppForm } from "@/components/forms/form-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  id: string;
  isValidFilter: boolean;
};

export const FilterInputNumber = observer(({ id, isValidFilter }: Props) => {
  const store = useAppForm();
  const { intlStore } = useRootStore();
  const fmt = useCallback((n: number | undefined) => intlStore.formatNumber(n), [intlStore]);

  const storeNumber = store?.getValue(id) as number | undefined;
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState<string>(() => fmt(storeNumber));

  useEffect(() => {
    if (!focused) setText(fmt(storeNumber));
  }, [storeNumber, focused, fmt]);

  return (
    <Input
      className={cn("h-full", isValidFilter ? "border-primary bg-primary/10" : "border-input")}
      disabled={store?.isDisabled}
      id={id}
      inputMode="decimal"
      type="text"
      value={text}
      onBlur={() => {
        setFocused(false);
        const parsed = intlStore.parseNumber(text);
        setText(fmt(parsed));
        store?.onChange(id, parsed);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        store?.onChange(id, intlStore.parseNumber(next));
      }}
      onFocus={() => {
        setText(intlStore.formatNumberForEditing(storeNumber));
        setFocused(true);
      }}
    />
  );
});
