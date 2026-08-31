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
  label?: ReactNode;
  errorMessage?: ReactNode;
  required?: boolean;
  className?: string;
  containerClassName?: string;
};

export const FormCheckbox = observer(({ id, label, errorMessage, required, className, containerClassName }: Props) => {
  const store = useAppForm();
  const checked = Boolean(store?.getValue(id));
  const { errors, hasError } = useFormFieldErrors(id);
  const isLoading = store?.isLoading ?? false;
  const isReadOnly = !isLoading && (store?.isReadOnly ?? false);
  const errorId = `${id}-error`;
  const resolvedErrorMessage = errorMessage ?? (Array.isArray(errors) ? errors.join(" ") : errors);

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
          disabled={isLoading}
          id={id}
          onCheckedChange={isReadOnly ? undefined : (next) => store?.onChange(id, next === true)}
        />

        {label && (
          <FormLabel htmlFor={id}>
            <span>
              {label}

              {required ? <span className="text-destructive"> *</span> : null}
            </span>
          </FormLabel>
        )}
      </div>

      {hasError && resolvedErrorMessage ? (
        <p className="text-xs text-destructive" id={errorId} role="alert">
          {resolvedErrorMessage}
        </p>
      ) : null}
    </div>
  );
});
