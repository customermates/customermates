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
  readOnly?: boolean;
  items?: FormSelectItem[];
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  optionsLoading?: boolean;
  onValueChange?: (value: string) => void;
};

export const FormSelect = observer(
  ({
    id,
    label,
    description,
    placeholder,
    required,
    readOnly,
    items,
    children,
    className,
    containerClassName,
    optionsLoading = false,
    onValueChange,
  }: Props) => {
    const t = useTranslations();
    const store = useAppForm();
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const raw = store?.getValue(id);
    const value = raw == null ? "" : String(raw);
    const { hasError } = useFormFieldErrors(id);
    const selectedItem = items?.find((it) => it.value === value);
    const isReadOnly = (store?.isReadOnly ?? false) || Boolean(readOnly);
    const isLoading = store?.isLoading ?? false;
    const hasUnresolvedValue = value !== "" && selectedItem === undefined;

    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <Select
          disabled={isLoading}
          open={isReadOnly ? false : undefined}
          value={value}
          onValueChange={(next) => (onValueChange ? onValueChange(next) : store?.onChange(id, next))}
        >
          <SelectTrigger
            aria-busy={optionsLoading || undefined}
            aria-invalid={hasError}
            aria-readonly={isReadOnly || undefined}
            className={cn(
              "w-full",
              isReadOnly && "cursor-default hover:bg-input-background hover:text-foreground [&>svg:last-child]:hidden",
              className,
            )}
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
