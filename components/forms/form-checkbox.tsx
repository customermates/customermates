"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors } from "./use-form-field";

type Props = {
  id: string;
  inputId?: string;
  label?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
};

export const FormCheckbox = observer(
  ({
    id,
    inputId,
    label,
    required,
    disabled,
    className,
    containerClassName,
  }: Props) => {
    const store = useAppForm();
    const checked = Boolean(store?.getValue(id));
    const { hasError } = useFormFieldErrors(id);
    const isDisabled = Boolean(disabled || store?.isLoading);
    const isReadOnly = !isDisabled && (store?.isReadOnly ?? false);
    const domId = inputId ?? id;

    return (
      <div className={cn("flex items-center gap-2", containerClassName)}>
        <Checkbox
          aria-invalid={hasError}
          aria-readonly={isReadOnly || undefined}
          aria-required={required}
          checked={checked}
          className={className}
          disabled={isDisabled}
          id={domId}
          onCheckedChange={
            isReadOnly
              ? undefined
              : (next) => store?.onChange(id, next === true)
          }
        />

        {label && (
          <FormLabel fieldId={id} htmlFor={domId}>
            <span>
              {label}

              {required ? <span className="text-destructive"> *</span> : null}
            </span>
          </FormLabel>
        )}
      </div>
    );
  },
);
