"use client";

import type { ComponentProps, ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { Input } from "@/components/ui/input";
import { FormLabel } from "./form-label";
import { FormControlRow } from "./form-control-row";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { FormFieldError } from "./form-field-error";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "id"> & {
  id: string;
  inputId?: string;
  label?: string | null;
  description?: ReactNode;
  required?: boolean;
  showErrorMessage?: boolean;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  endContent?: ReactNode;
  labelEndAddon?: ReactNode;
  controlStartAddon?: ReactNode;
  onValueChange?: (value: string) => void;
};

export const FormInput = observer(
  ({
    id,
    inputId,
    label,
    description,
    required,
    showErrorMessage = false,
    className,
    containerClassName,
    disabled,
    readOnly,
    endContent,
    labelEndAddon,
    controlStartAddon,
    onValueChange,
    ...props
  }: Props) => {
    const store = useAppForm();
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const value = (store?.getValue(id) as string | number | undefined) ?? "";
    const { hasError, message } = useFormFieldErrors(id);
    const isDisabled = Boolean(disabled || store?.isLoading);
    const isReadOnly = !isDisabled && Boolean(readOnly || store?.isReadOnly);
    const domId = inputId ?? id;
    const errorId = `${domId}-error`;
    const errorShown = showErrorMessage && hasError && Boolean(message);

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <div className="flex items-center gap-1.5">
            <FormLabel fieldId={id} htmlFor={domId}>
              {resolvedLabel}

              {required ? <span className="text-destructive"> *</span> : null}
            </FormLabel>

            {labelEndAddon}
          </div>
        )}

        <FormControlRow startAddon={controlStartAddon}>
          <Input
            aria-describedby={errorShown ? errorId : undefined}
            aria-invalid={hasError}
            className={cn(endContent && "pr-10", className)}
            disabled={isDisabled}
            id={domId}
            readOnly={isReadOnly}
            required={required}
            value={value}
            onChange={(event) =>
              onValueChange ? onValueChange(event.target.value) : store?.onChange(id, event.target.value)
            }
            {...props}
          />

          {endContent && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">{endContent}</div>
          )}
        </FormControlRow>

        {errorShown && <FormFieldError id={errorId}>{message}</FormFieldError>}

        {description && !hasError && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    );
  },
);
