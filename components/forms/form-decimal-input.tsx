"use client";

import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";

import { Input } from "@/components/ui/input";
import { FormLabel } from "./form-label";
import { FormControlRow } from "./form-control-row";
import { cn } from "@/core/utils/cn";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type Props = {
  id: string;
  inputId?: string;
  label?: string | null;
  required?: boolean;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  endContent?: ReactNode;
};

export const FormDecimalInput = observer(function FormDecimalInput({
  id,
  inputId,
  label,
  required,
  className,
  containerClassName,
  disabled,
  readOnly,
  endContent,
}: Props) {
  const store = useAppForm();
  const intlStore = useHydratedIntlStore();
  const resolvedLabel = useResolvedFieldLabel(id, label);
  const { hasError } = useFormFieldErrors(id);
  const isDisabled = Boolean(disabled || store?.isLoading);
  const isReadOnly = !isDisabled && Boolean(readOnly || store?.isReadOnly);
  const domId = inputId ?? id;

  const raw = store?.getValue(id);
  const stored = raw === undefined || raw === null ? "" : String(raw);
  const formatted = intlStore.formatDecimal(stored);

  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatted);

  useEffect(() => {
    if (!focused) setText(formatted);
  }, [formatted, focused]);

  function commit(next: string) {
    const trimmed = next.trim();
    store?.onChange(id, trimmed ? (intlStore.parseNumberToCanonical(trimmed) ?? trimmed) : undefined);
  }

  return (
    <div className={cn("space-y-1.5", containerClassName)}>
      {resolvedLabel && (
        <div className="flex items-center gap-1.5">
          <FormLabel fieldId={id} htmlFor={domId}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        </div>
      )}

      <FormControlRow>
        <Input
          aria-invalid={hasError}
          className={cn(endContent && "pr-14", className)}
          disabled={isDisabled}
          id={domId}
          inputMode="decimal"
          readOnly={isReadOnly}
          required={required}
          type="text"
          value={text}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            setText(event.target.value);
            commit(event.target.value);
          }}
          onFocus={() => {
            if (isReadOnly) return;
            setText(intlStore.formatDecimalForEditing(stored));
            setFocused(true);
          }}
        />

        {endContent && (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground">
            {endContent}
          </span>
        )}
      </FormControlRow>
    </div>
  );
});
