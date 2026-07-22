"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";

import { useAppForm } from "@/components/forms/form-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";

type Props = {
  id: string;
  isValidFilter: boolean;
};

function parseDecimalString(raw: string): number | undefined {
  let s = raw.trim().replace(/\s/g, "");
  if (!s || s === "-" || s === ".") return undefined;
  const c = s.lastIndexOf(",");
  const d = s.lastIndexOf(".");
  s = c > d ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

export const FilterInputNumber = observer(({ id, isValidFilter }: Props) => {
  const store = useAppForm();

  const format = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, useGrouping: true }), []);

  const fmt = useCallback((n: number | undefined) => (n == null || Number.isNaN(n) ? "" : format.format(n)), [format]);

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
        const parsed = parseDecimalString(text);
        setText(fmt(parsed));
        store?.onChange(id, parsed);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        store?.onChange(id, parseDecimalString(next));
      }}
      onFocus={() => {
        setText(storeNumber === undefined ? "" : String(storeNumber));
        setFocused(true);
      }}
    />
  );
});
