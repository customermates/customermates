"use client";

import type { ComponentProps, ReactNode } from "react";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { Textarea, TEXTAREA_CLASS_NAME } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormLabel } from "./form-label";
import { cn } from "@/core/utils/cn";

import { useAppForm } from "./form-context";
import { useFormFieldErrors, useResolvedFieldLabel } from "./use-form-field";

type Props = Omit<ComponentProps<"textarea">, "value" | "onChange" | "id" | "disabled" | "readOnly"> & {
  id: string;
  inputId?: string;
  label?: string | null;
  required?: boolean;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  collapsible?: boolean;
  endContent?: ReactNode;
  ariaLabel?: string;
};

export const FormTextarea = observer(
  ({
    id,
    inputId,
    label,
    required,
    className,
    containerClassName,
    disabled,
    readOnly,
    collapsible = false,
    endContent,
    ariaLabel,
    ...props
  }: Props) => {
    const t = useTranslations();
    const store = useAppForm();
    const resolvedLabel = useResolvedFieldLabel(id, label);
    const value = (store?.getValue(id) as string | undefined) ?? "";
    const { hasError } = useFormFieldErrors(id);
    const isDisabled = Boolean(disabled || store?.isLoading);
    const isReadOnly = !isDisabled && Boolean(readOnly || store?.isReadOnly);
    const domId = inputId ?? id;
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const measured = useRef<HTMLSpanElement>(null);
    const control = useRef<HTMLTextAreaElement>(null);
    const preview = useRef<HTMLButtonElement>(null);
    const returnFocus = useRef(false);
    const isEditing = editing && !isDisabled && !isReadOnly;
    const showPreview = collapsible && overflowing && !isEditing && !expanded && !hasError;

    useEffect(() => {
      if (!collapsible || !measured.current) return;
      const element = measured.current;
      const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const resize = new ResizeObserver(measure);
      resize.observe(element);
      return () => resize.disconnect();
    }, [collapsible, value]);

    useLayoutEffect(() => {
      if (isEditing) control.current?.focus();
      else if (returnFocus.current) {
        returnFocus.current = false;
        (preview.current ?? control.current)?.focus();
      }
    }, [isEditing]);

    return (
      <div
        className={cn("min-w-0 space-y-1.5", containerClassName)}
        data-collapsible-text-field={collapsible || undefined}
      >
        {resolvedLabel && (
          <FormLabel fieldId={id} htmlFor={domId}>
            {resolvedLabel}

            {required ? <span className="text-destructive"> *</span> : null}
          </FormLabel>
        )}

        <div className="relative min-w-0">
          {collapsible && (
            <div
              aria-hidden
              inert
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 -z-10 px-3 py-1.5 text-base opacity-0 md:text-sm",
                endContent && "pr-14",
              )}
            >
              <span ref={measured} className="line-clamp-4 whitespace-pre-wrap wrap-anywhere">
                {value || "\u00a0"}
              </span>
            </div>
          )}

          {showPreview ? (
            <button
              ref={preview}
              aria-label={t("RecordModel.editValue", {
                field: ariaLabel ?? resolvedLabel ?? id,
              })}
              className={cn(
                TEXTAREA_CLASS_NAME,
                "min-h-9 cursor-text py-1.5 text-left",
                endContent && "pr-14",
                className,
              )}
              disabled={isDisabled || isReadOnly}
              id={domId}
              type="button"
              onClick={() => setEditing(true)}
            >
              <span className="line-clamp-4 whitespace-pre-wrap wrap-anywhere">{value}</span>
            </button>
          ) : (
            <Textarea
              ref={control}
              aria-invalid={hasError}
              aria-label={ariaLabel}
              className={cn(
                collapsible && "min-h-9 max-h-80 resize-none overflow-y-auto py-1.5 wrap-anywhere",
                endContent && "pr-14",
                className,
              )}
              disabled={isDisabled}
              id={domId}
              readOnly={isReadOnly}
              required={required}
              value={value}
              onChange={(event) => store?.onChange(id, event.target.value)}
              {...props}
              onBlur={(event) => {
                setEditing(false);
                props.onBlur?.(event);
              }}
              onFocus={(event) => {
                if (collapsible && !isDisabled && !isReadOnly) setEditing(true);
                props.onFocus?.(event);
              }}
              onKeyDownCapture={(event) => {
                if (isEditing && overflowing && event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  returnFocus.current = true;
                  setEditing(false);
                }
                props.onKeyDownCapture?.(event);
              }}
            />
          )}

          {endContent && <div className="absolute right-1.5 top-1.5 flex items-center">{endContent}</div>}
        </div>

        {collapsible && !isEditing && overflowing && (
          <Button
            aria-controls={domId}
            aria-expanded={expanded}
            className="gap-1 px-0 font-normal text-muted-foreground has-[>svg]:px-0 aria-expanded:[&_svg]:rotate-180"
            size="xs"
            type="button"
            variant="ghost"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("Common.actions.showLess") : t("Common.actions.showMore")}

            <ChevronDown aria-hidden className="size-3" />
          </Button>
        )}
      </div>
    );
  },
);
