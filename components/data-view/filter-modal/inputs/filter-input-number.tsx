"use client";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";

import { useAppForm } from "@/components/forms/form-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";
import { filterNumberValue } from "@/core/base/filter-value";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = {
  id: string;
  isValidFilter: boolean;
};

export const FilterInputNumber = observer(({ id, isValidFilter }: Props) => {
  const store = useAppForm();
  const intlStore = useHydratedIntlStore();
  const fmt = useCallback((n: number | undefined) => intlStore.formatNumber(n), [intlStore]);

  const storeNumber = filterNumberValue(store?.getValue(id));
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
        const canonical = intlStore.parseNumberToCanonical(text);
        setText(fmt(filterNumberValue(canonical)));
        store?.onChange(id, canonical);
        store?.flushPendingChanges?.();
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        store?.onChange(id, intlStore.parseNumberToCanonical(next));
      }}
      onFocus={() => {
        setText(intlStore.formatNumberForEditing(storeNumber));
        setFocused(true);
      }}
    />
  );
});
