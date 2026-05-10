"use client";

import type { KeyboardEvent, ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { FormLabel } from "./form-label";
import { cn } from "@/lib/utils";
import { useAppForm } from "./form-context";

type Props = {
  id: string;
  label?: string | null;
  placeholder?: string;
  required?: boolean;
  allowMultiple?: boolean;
  arrayMode?: boolean;
  renderChip?: (value: string, endContent: ReactNode) => ReactNode;
  chipColor?: ChipColor;
  value?: string;
  onValueChange?: (value: string | undefined) => void;
  onChipClick?: (value: string) => void;
  className?: string;
  containerClassName?: string;
};

export const FormInputChips = observer(
  ({
    id,
    label,
    placeholder,
    required,
    allowMultiple,
    arrayMode,
    renderChip,
    chipColor,
    value: controlledValue,
    onValueChange,
    onChipClick,
    className,
    containerClassName,
  }: Props) => {
    const [inputValue, setInputValue] = useState("");

    const store = useAppForm();
    const t = useTranslations("Common.inputs");
    const resolvedLabel = label === null ? undefined : (label ?? t(id));
    const storeValue = store?.getValue(id) as string[] | string | undefined;
    const fieldValue = controlledValue ?? storeValue;
    const hasErrorAt = (path: string) => {
      const e = store?.getError(path);
      return Array.isArray(e) ? e.length > 0 : Boolean(e);
    };
    const isReadOnly = store?.isReadOnly ?? false;
    const isDisabled = store?.isLoading ?? false;

    let chipValues: string[] = [];
    if (arrayMode) {
      if (Array.isArray(fieldValue)) chipValues = fieldValue;
    } else if (typeof fieldValue === "string" && fieldValue !== "")
      chipValues = fieldValue.split(",").filter((v) => v.trim() !== "");

    const chipErrors = chipValues.map((_, i) => hasErrorAt(`${id}[${i}]`));
    const hasError = hasErrorAt(id) || chipErrors.some(Boolean);

    function commit(next: string[]) {
      if (arrayMode) {
        if (onValueChange) onValueChange(next as unknown as string);
        else store?.onChange(id, next);
      } else {
        const nextValue = allowMultiple ? next.join(",") : next[next.length - 1];
        if (onValueChange) onValueChange(nextValue);
        else store?.onChange(id, nextValue);
      }
      setInputValue("");
    }

    function commitInput() {
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      if (chipValues.includes(trimmed)) {
        setInputValue("");
        return;
      }
      commit([...chipValues, trimmed]);
    }

    function handleInputChange(value: string) {
      if (!/[,;]/.test(value)) {
        setInputValue(value);
        return;
      }
      const parts = value
        .split(/[,;]/)
        .map((p) => p.trim())
        .filter(Boolean);
      const newChips = parts.filter((p) => !chipValues.includes(p));
      if (newChips.length > 0) commit([...chipValues, ...newChips]);
      else setInputValue("");
    }

    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      const key = event.key;

      if (key === "Enter" || key === "," || key === ";") {
        event.preventDefault();
        commitInput();
      }

      if (key === "Backspace" && inputValue === "" && chipValues.length > 0) {
        event.preventDefault();
        commit(chipValues.slice(0, -1));
      }
    }

    function handleRemove(item: string) {
      commit(chipValues.filter((v) => v !== item));
    }

    return (
      <div className={cn("space-y-1.5", containerClassName)}>
        {resolvedLabel && (
          <FormLabel htmlFor={id}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <div
          className={cn(
            "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-input-background px-2 py-1 text-sm shadow-xs",
            "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            hasError &&
              "border-destructive focus-within:border-destructive ring-destructive/20 focus-within:ring-destructive/20",
            isDisabled && "pointer-events-none opacity-50",
            isReadOnly && "cursor-default",
            className,
          )}
        >
          {chipValues.map((item, index) => {
            const chipHasError = chipErrors[index] ?? false;
            const removeButton = isReadOnly ? undefined : (
              <button
                aria-label="Remove"
                className="opacity-50 hover:opacity-100 transition-opacity"
                tabIndex={-1}
                type="button"
                onClick={() => handleRemove(item)}
              >
                <XIcon className="size-3" />
              </button>
            );
            const chip = renderChip ? (
              renderChip(item, removeButton)
            ) : (
              <AppChip endContent={removeButton} variant={chipHasError ? "destructive" : (chipColor ?? "secondary")}>
                {item}
              </AppChip>
            );

            if (onChipClick) {
              return (
                <span
                  key={`${item}-${index}`}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button")) return;
                    onChipClick(item);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onChipClick(item);
                  }}
                >
                  {chip}
                </span>
              );
            }

            return <span key={`${item}-${index}`}>{chip}</span>;
          })}

          {!isReadOnly && (
            <input
              aria-invalid={hasError}
              className="flex-1 min-w-24 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              disabled={isDisabled}
              id={id}
              placeholder={placeholder}
              value={inputValue}
              onBlur={commitInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={onKeyDown}
            />
          )}
        </div>
      </div>
    );
  },
);

export type { Props as FormInputChipsProps };
