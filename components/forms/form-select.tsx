"use client";

import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormLabel } from "./form-label";
import { FormControlRow } from "./form-control-row";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";
import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "./selection-loading";

export type FormSelectItem = {
  value: string;
  label: string;
  textValue?: string;
  disabled?: boolean;
  color?: ChipColor;
  startContent?: ReactNode;
  description?: ReactNode;
};

type Props = {
  id: string;
  inputId?: string;
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
  value?: string;
  onValueChange?: (value: string) => void;
  labelEndAddon?: ReactNode;
  endContent?: ReactNode;
  ariaLabel?: string;
};

export const FormSelect = observer(
  ({
    id,
    inputId,
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
    value: controlledValue,
    onValueChange,
    labelEndAddon,
    endContent,
    ariaLabel,
  }: Props) => {
    const t = useTranslations();
    const store = useAppForm();
    const [open, setOpen] = useState(false);
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const raw = controlledValue ?? store?.getValue(id);
    const value = raw == null ? "" : String(raw);
    const { hasError } = useFormFieldErrors(id);
    const selectedItem = items?.find((it) => it.value === value);
    const isDisabled = Boolean(disabled) || Boolean(store?.isLoading);
    const isReadOnly = !isDisabled && ((store?.isReadOnly ?? false) || Boolean(readOnly));
    const hasUnresolvedValue = value !== "" && selectedItem === undefined;
    const canEdit = !isDisabled && !isReadOnly;
    const domId = inputId ?? id;

    useEffect(() => {
      if (!canEdit) setOpen(false);
    }, [canEdit]);

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {resolvedLabel && (
          <div className="flex items-center gap-1.5">
            <FormLabel fieldId={id} htmlFor={domId}>
              {resolvedLabel}

              {required ? <span className="text-destructive"> *</span> : null}
            </FormLabel>

            {labelEndAddon}
          </div>
        )}

        <Select
          disabled={isDisabled}
          open={canEdit && open}
          value={value}
          onOpenChange={(next) => setOpen(canEdit && next)}
          onValueChange={
            !canEdit ? undefined : (next) => (onValueChange ? onValueChange(next) : store?.onChange(id, next))
          }
        >
          <FormControlRow>
            <SelectTrigger
              aria-busy={optionsLoading || undefined}
              aria-invalid={hasError}
              aria-label={resolvedLabel ? undefined : ariaLabel}
              aria-readonly={isReadOnly || undefined}
              className={cn(
                "w-full",
                className,
                endContent && "relative pr-16 [&>svg:last-child]:absolute [&>svg:last-child]:right-3",
                isReadOnly && "[&>svg:last-child]:hidden",
              )}
              id={domId}
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

            {endContent && (
              <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center">{endContent}</div>
            )}
          </FormControlRow>

          <SelectContent>
            {optionsLoading ? (
              <SelectionOptionsSkeleton label={t("Loading.text")} />
            ) : (
              <>
                {items?.map((item) => (
                  <SelectItem
                    key={item.value}
                    disabled={item.disabled}
                    textValue={item.textValue ?? item.label}
                    value={item.value}
                  >
                    {item.color ? (
                      <span className="flex items-center gap-2">
                        <AppChip variant={item.color}>{item.label}</AppChip>

                        {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
                      </span>
                    ) : (
                      <span className={cn("flex items-center gap-2", item.description && "items-start")}>
                        {item.startContent}

                        <span className="flex flex-col gap-0.5">
                          <span>{item.label}</span>

                          {item.description && (
                            <span className="max-w-64 whitespace-normal text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </span>
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
