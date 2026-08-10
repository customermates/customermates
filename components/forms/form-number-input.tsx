"use client";

import type { ComponentProps, ReactNode } from "react";

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";

import { Input } from "@/components/ui/input";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type Props = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "id" | "disabled" | "size"
> & {
  id: string;
  label?: string | null;
  required?: boolean;
  locale?: string;
  formatOptions?: Intl.NumberFormatOptions;
  value?: number;
  onValueChange?: (value: number | undefined) => void;
  className?: string;
  containerClassName?: string;
  endContent?: ReactNode;
  hideStepper?: boolean;
  size?: "sm" | "md" | "lg";
};

export const FormNumberInput = observer(
  ({
    id,
    label,
    required,
    locale,
    formatOptions,
    value: controlledValue,
    onValueChange,
    className,
    containerClassName,
    onBlur,
    onFocus,
    endContent,
    hideStepper: _hideStepper,
    size: _size,
    ...props
  }: Props) => {
    const isReq = required;
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const store = useAppForm();
    const { intlStore } = useRootStore();
    const controlled = onValueChange !== undefined;

    const { hasError } = useFormFieldErrors(id);
    const isDisabled = store?.isLoading;
    const isReadOnly = store?.isReadOnly;

    const effectiveLocale = locale ?? intlStore.formattingLocale;

    const fmt = useCallback(
      (n: number | undefined) =>
        n == null
          ? ""
          : new Intl.NumberFormat(effectiveLocale, {
              maximumFractionDigits: 2,
              useGrouping: true,
              ...formatOptions,
            }).format(n),
      [effectiveLocale, formatOptions],
    );

    const storeNumber = store?.getValue(id) as number | undefined;
    const activeNumber = controlled ? controlledValue : storeNumber;

    const [focused, setFocused] = useState(false);
    const [text, setText] = useState<string>(() => fmt(activeNumber));

    useEffect(() => {
      if (!focused) setText(fmt(activeNumber));
    }, [activeNumber, focused, fmt]);

    function commit(n: number | undefined) {
      if (controlled) onValueChange?.(n);
      else store?.onChange(id, n);
    }

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {isReq ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <div className="relative">
          <Input
            aria-invalid={hasError}
            className={cn(endContent && "pr-8", className)}
            disabled={isDisabled}
            id={id}
            inputMode="decimal"
            readOnly={isReadOnly}
            required={isReq}
            type="text"
            value={text}
            {...props}
            onBlur={(e) => {
              setFocused(false);
              const parsed = intlStore.parseNumber(text, effectiveLocale);
              setText(fmt(parsed));
              commit(parsed);
              onBlur?.(e);
            }}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              commit(intlStore.parseNumber(next, effectiveLocale));
            }}
            onFocus={(e) => {
              setText(intlStore.formatNumberForEditing(activeNumber, effectiveLocale));
              setFocused(true);
              onFocus?.(e);
            }}
          />

          {endContent && (
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground">
              {endContent}
            </span>
          )}
        </div>
      </div>
    );
  },
);
