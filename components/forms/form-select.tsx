"use client";

import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormLabel } from "./form-label";
import { cn } from "@/lib/utils";

import { useAppForm } from "./form-context";

export type FormSelectItem = {
  value: string;
  label: string;
  disabled?: boolean;
  color?: ChipColor;
};

type Props = {
  id: string;
  label?: string | null;
  placeholder?: string;
  required?: boolean;
  items?: FormSelectItem[];
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  onValueChange?: (value: string) => void;
};

export const FormSelect = observer(
  ({ id, label, placeholder, required, items, children, className, containerClassName, onValueChange }: Props) => {
    const store = useAppForm();
    const t = useTranslations("Common.inputs");
    const resolvedLabel = label === null ? undefined : (label ?? t(id));
    const raw = store?.getValue(id);
    const value = raw == null ? "" : String(raw);
    const errors = store?.getError(id);
    const hasError = Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
    const selectedItem = items?.find((it) => it.value === value);
    const isReadOnly = store?.isReadOnly ?? false;
    const isLoading = store?.isLoading ?? false;

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
              {selectedItem &&
                (selectedItem.color ? (
                  <AppChip variant={selectedItem.color}>{selectedItem.label}</AppChip>
                ) : (
                  <span>{selectedItem.label}</span>
                ))}
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            {items?.map((item) => (
              <SelectItem key={item.value} disabled={item.disabled} textValue={item.label} value={item.value}>
                {item.color ? <AppChip variant={item.color}>{item.label}</AppChip> : item.label}
              </SelectItem>
            ))}

            {children}
          </SelectContent>
        </Select>
      </div>
    );
  },
);
