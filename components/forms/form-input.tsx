"use client";

import type { ComponentProps, ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { Input } from "@/components/ui/input";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "id"> & {
  id: string;
  label?: string | null;
  description?: ReactNode;
  required?: boolean;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  endContent?: ReactNode;
};

export const FormInput = observer(
  ({
    id,
    label,
    description,
    required,
    className,
    containerClassName,
    disabled,
    readOnly,
    endContent,
    ...props
  }: Props) => {
    const store = useAppForm();
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const value = (store?.getValue(id) as string | number | undefined) ?? "";
    const { hasError } = useFormFieldErrors(id);
    const isDisabled = disabled ?? store?.isLoading;
    const isReadOnly = readOnly ?? store?.isReadOnly;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {required ? <span className="text-destructive">&nbsp;*</span> : null}
          </FormLabel>
        )}

        <div className="relative">
          <Input
            aria-invalid={hasError}
            className={cn(endContent && "pr-10", className)}
            disabled={isDisabled}
            id={id}
            readOnly={isReadOnly}
            required={required}
            value={value}
            onChange={(event) => store?.onChange(id, event.target.value)}
            {...props}
          />

          {endContent && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">{endContent}</div>
          )}
        </div>

        {description && !hasError && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    );
  },
);
