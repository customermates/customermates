"use client";

import type { ChipColor } from "@/constants/chip-colors";

import { observer } from "mobx-react-lite";

import { AppChip } from "@/components/chip/app-chip";
import { FormLabel } from "./form-label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type SelectItemShape = {
  key: string;
  color?: ChipColor;
};

type Props = {
  id: string;
  label?: string | null;
  placeholder?: string;
  required?: boolean;
  items: Iterable<SelectItemShape> | undefined;
  translateFn: (key: string) => string;
  disabledKeys?: Set<string> | Iterable<string>;
  disabled?: boolean;
  className?: string;
  containerClassName?: string;
};

export const FormSelectChip = observer(
  ({
    id,
    label,
    placeholder,
    required,
    items,
    translateFn,
    disabledKeys,
    disabled,
    className,
    containerClassName,
  }: Props) => {
    const store = useAppForm();
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const raw = store?.getValue(id);
    const value = raw == null ? "" : String(raw);
    const { hasError } = useFormFieldErrors(id);

    const itemsArray = items ? Array.from(items) : [];
    const disabledSet = disabledKeys ? new Set(disabledKeys) : undefined;
    const selected = itemsArray.find((i) => i.key === value);
    const isReadOnly = !disabled && (store?.isReadOnly ?? false);
    const isDisabled = disabled || (store?.isLoading ?? false);

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <Select
          disabled={isDisabled}
          open={isReadOnly ? false : undefined}
          value={value}
          onValueChange={(next) => store?.onChange(id, next)}
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
              {selected ? <AppChip variant={selected.color ?? "secondary"}>{translateFn(selected.key)}</AppChip> : null}
            </SelectValue>
          </SelectTrigger>

          <SelectContent>
            {itemsArray.map((item) => (
              <SelectItem
                key={item.key}
                disabled={disabledSet?.has(item.key)}
                textValue={translateFn(item.key)}
                value={item.key}
              >
                <AppChip variant={item.color ?? "secondary"}>{translateFn(item.key)}</AppChip>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  },
);
