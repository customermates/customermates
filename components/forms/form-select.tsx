"use client";

import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";
import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "./selection-loading";

export type FormSelectItem = {
  value: string;
  label: string;
  disabled?: boolean;
  color?: ChipColor;
  startContent?: ReactNode;
};

type Props = {
  id: string;
  label?: string | null;
  description?: ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  items?: FormSelectItem[];
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  optionsLoading?: boolean;
  onValueChange?: (value: string) => void;
  labelEndAddon?: ReactNode;
};

export const FormSelect = observer(
  ({
    id,
    label,
    description,
    placeholder,
    required,
    disabled,
    readOnly,
    items,
    children,
    className,
    containerClassName,
    optionsLoading = false,
    onValueChange,
    labelEndAddon,
  }: Props) => {
    const t = useTranslations();
    const store = useAppForm();
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const raw = store?.getValue(id);
    const value = raw == null ? "" : String(raw);
    const { hasError } = useFormFieldErrors(id);
    const selectedItem = items?.find((it) => it.value === value);
    const isDisabled = Boolean(disabled) || Boolean(store?.isLoading);
    const isReadOnly = !isDisabled && ((store?.isReadOnly ?? false) || Boolean(readOnly));
    const hasUnresolvedValue = value !== "" && selectedItem === undefined;

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {resolvedLabel && (
          <div className="flex items-center gap-1.5">
            <FormLabel htmlFor={id}>
              {resolvedLabel}

              {required ? <span className="text-destructive"> *</span> : null}
            </FormLabel>

            {labelEndAddon}
          </div>
        )}

        <Select
          disabled={isDisabled}
          open={isReadOnly ? false : undefined}
          value={value}
          onValueChange={
            isReadOnly ? undefined : (next) => (onValueChange ? onValueChange(next) : store?.onChange(id, next))
          }
        >
          <SelectTrigger
            aria-busy={optionsLoading || undefined}
            aria-invalid={hasError}
            aria-readonly={isReadOnly || undefined}
            className={cn("w-full", className, isReadOnly && "[&>svg:last-child]:hidden")}
            id={id}
          >
            <SelectValue placeholder={placeholder ?? " "}>
              {optionsLoading && !selectedItem ? (
                <SelectionValueSkeleton />
              ) : selectedItem ? (
                selectedItem.color ? (
                  <AppChip variant={selectedItem.color}>{selectedItem.label}</AppChip>
                ) : (
                  <>
                    {selectedItem.startContent}

                    <span>{selectedItem.label}</span>
                  </>
                )
              ) : hasUnresolvedValue ? (
                <span className="text-muted-foreground">{t("Common.inputs.unavailableSelection")}</span>
              ) : null}
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            {optionsLoading ? (
              <SelectionOptionsSkeleton label={t("Loading.text")} />
            ) : (
              <>
                {items?.map((item) => (
                  <SelectItem key={item.value} disabled={item.disabled} textValue={item.label} value={item.value}>
                    {item.color ? (
                      <AppChip variant={item.color}>{item.label}</AppChip>
                    ) : (
                      <span className="flex items-center gap-2">
                        {item.startContent}

                        {item.label}
                      </span>
                    )}
                  </SelectItem>
                ))}

                {children}
              </>
            )}
          </SelectContent>
        </Select>

        {description && !hasError && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    );
  },
);
