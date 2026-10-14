"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { FormFieldError } from "./form-field-error";
import { useFormFieldErrors } from "./use-form-field";

type Props = {
  id: string;
  inputId?: string;
  label?: ReactNode;
  errorMessage?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
};

export const FormCheckbox = observer(
  ({ id, inputId, label, errorMessage, required, disabled, className, containerClassName }: Props) => {
    const store = useAppForm();
    const checked = Boolean(store?.getValue(id));
    const { message, hasError } = useFormFieldErrors(id);
    const isDisabled = Boolean(disabled || store?.isLoading);
    const isReadOnly = !isDisabled && (store?.isReadOnly ?? false);
    const errorId = `${id}-error`;
    const domId = inputId ?? id;
    const resolvedErrorMessage = errorMessage ?? message;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        <div className="flex items-center gap-2">
          <Checkbox
            aria-describedby={hasError ? errorId : undefined}
            aria-invalid={hasError}
            aria-readonly={isReadOnly || undefined}
            aria-required={required}
            checked={checked}
            className={className}
            disabled={isDisabled}
            id={domId}
            onCheckedChange={isReadOnly ? undefined : (next) => store?.onChange(id, next === true)}
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

        {hasError && resolvedErrorMessage ? <FormFieldError id={errorId}>{resolvedErrorMessage}</FormFieldError> : null}
      </div>
    );
  },
);
