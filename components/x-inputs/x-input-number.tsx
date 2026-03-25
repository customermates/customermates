"use client";

import type { InputProps } from "@heroui/input";

import { Input } from "@heroui/input";
import { useLocale, useTranslations } from "next-intl";
import { autorun } from "mobx";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useXForm } from "./x-form";

type Props = Omit<InputProps, "defaultValue" | "onValueChange" | "type" | "value"> & {
  id: string;
  formatOptions?: Intl.NumberFormatOptions;
  hideStepper?: boolean;
  onValueChange?: (value: number | undefined) => void;
  value?: number | undefined;
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

export function XInputNumber({
  id,
  label,
  formatOptions,
  hideStepper: _hideStepper,
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  onValueChange: onNumberChange,
  value: valueProp,
  ...props
}: Props) {
  const t = useTranslations("Common.inputs");
  const locale = useLocale();
  const store = useXForm();
  const controlled = onNumberChange !== undefined;

  const format = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: true, ...formatOptions }),
    [locale, formatOptions],
  );

  const fmt = useCallback((n: number | undefined) => (n == null || Number.isNaN(n) ? "" : format.format(n)), [format]);

  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | string[] | undefined>(() =>
    controlled ? undefined : store?.getError(id),
  );
  const [isDisabled, setIsDisabled] = useState(() => (controlled ? false : Boolean(store?.isDisabled)));

  function commit(p: number | undefined) {
    if (controlled) onNumberChange?.(p);
    else store?.onChange(id, p);
  }

  useEffect(() => {
    if (controlled && !focused) setText(fmt(valueProp));
  }, [controlled, valueProp, fmt, focused]);

  useEffect(() => {
    if (!store) return;
    if (controlled) {
      return autorun(() => {
        setErrorMessage(store.getError(id));
        setIsDisabled(store.isDisabled ?? false);
      });
    }
    return autorun(() => {
      setErrorMessage(store.getError(id));
      setIsDisabled(store.isDisabled ?? false);
      if (!focused) setText(fmt(store.getValue(id) as number | undefined));
    });
  }, [controlled, store, id, focused, fmt]);

  const errorList = (
    <ul>
      {[errorMessage].flat().map((err, i) => (
        <li key={i}>{err}</li>
      ))}
    </ul>
  );

  return (
    <Input
      {...props}
      errorMessage={controlled && !store ? props.errorMessage : errorList}
      id={id}
      inputMode="decimal"
      isDisabled={controlled && !store ? props.isDisabled : isDisabled}
      isInvalid={controlled && !store ? Boolean(props.isInvalid) : Boolean(errorMessage)}
      label={label === null ? undefined : (label ?? t(id))}
      placeholder=" "
      type="text"
      value={text}
      variant="bordered"
      onBlur={(e) => {
        setFocused(false);
        const p = parseDecimalString(text);
        setText(fmt(p));
        commit(p);
        onBlurProp?.(e);
      }}
      onFocus={(e) => {
        const n = controlled ? valueProp : (store?.getValue(id) as number | undefined);
        setText(n === undefined ? "" : String(n));
        setFocused(true);
        onFocusProp?.(e);
      }}
      onValueChange={(val) => {
        setText(val);
        commit(parseDecimalString(val));
      }}
    />
  );
}
