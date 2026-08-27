"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors } from "./use-form-field";

export type FormRadioGroupOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type Props = {
  id: string;
  label?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  required?: boolean;
  options?: FormRadioGroupOption[];
  orientation?: "horizontal" | "vertical";
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
};

export const FormRadioGroup = observer(
  ({
    id,
    label,
    ariaLabel,
    ariaLabelledBy,
    required,
    options,
    orientation = "horizontal",
    children,
    className,
    containerClassName,
  }: Props) => {
    const store = useAppForm();
    const raw = store?.getValue(id);
    const value = raw == null ? "" : String(raw);
    const { hasError } = useFormFieldErrors(id);
    const isLoading = store?.isLoading ?? false;
    const isReadOnly = !isLoading && (store?.isReadOnly ?? false);
    const labelId = `${id}-label`;

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {label && (
          <FormLabel id={labelId}>
            {label}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <RadioGroup
          aria-invalid={hasError}
          aria-label={!label && !ariaLabelledBy ? ariaLabel : undefined}
          aria-labelledby={ariaLabelledBy ?? (label ? labelId : undefined)}
          aria-readonly={isReadOnly || undefined}
          className={cn(orientation === "horizontal" ? "flex flex-wrap gap-4" : "grid gap-3", className)}
          disabled={isLoading}
          id={id}
          value={value}
          onValueChange={isReadOnly ? undefined : (next) => store?.onChange(id, next)}
        >
          {options?.map((option) => {
            const itemId = `${id}-${option.value}`;
            return (
              <div key={option.value} className="flex items-center gap-2">
                <RadioGroupItem
                  data-readonly={(isReadOnly && !option.disabled) || undefined}
                  disabled={option.disabled}
                  id={itemId}
                  value={option.value}
                />

                <Label className="font-normal" htmlFor={itemId}>
                  {option.label}
                </Label>
              </div>
            );
          })}

          {children}
        </RadioGroup>
      </div>
    );
  },
);
