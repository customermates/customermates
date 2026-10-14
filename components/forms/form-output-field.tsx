"use client";

import type { ReactNode } from "react";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";

import { FormFieldHelp } from "./form-field-help";
import { FormLabel } from "./form-label";
import { FormOutput } from "./form-output";
import { FormControlRow } from "./form-control-row";

type Props = {
  id?: string;
  label: string;
  children: ReactNode;
  help?: ReactNode;
  description?: ReactNode;
  labelEndAddon?: ReactNode;
  controlStartAddon?: ReactNode;
  controlEndAddon?: ReactNode;
  locked?: boolean;
  className?: string;
  outputClassName?: string;
};

export function FormOutputField({
  id,
  label,
  children,
  help,
  description,
  labelEndAddon,
  controlStartAddon,
  controlEndAddon,
  locked,
  className,
  outputClassName,
}: Props) {
  const t = useTranslations();
  const labelId = useId();
  const descriptionId = useId();
  const output = (
    <FormOutput
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={labelId}
      className={cn(controlEndAddon && "pr-9", outputClassName)}
    >
      {children}
    </FormOutput>
  );

  return (
    <div data-form-output-field className={cn("space-y-1.5", className)} id={id}>
      <div className="flex items-center gap-1.5">
        <FormLabel id={labelId}>{label}</FormLabel>

        {help ? (
          <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: label })}>{help}</FormFieldHelp>
        ) : null}

        {labelEndAddon}
      </div>

      <FormControlRow startAddon={controlStartAddon}>
        <div
          className={cn("w-full min-w-0", locked ? "cursor-not-allowed" : "cursor-default")}
          data-field-locked={locked ? "" : undefined}
        >
          {output}
        </div>

        {controlEndAddon ? (
          <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center" data-form-control-end="">
            {controlEndAddon}
          </div>
        ) : null}
      </FormControlRow>

      {description ? (
        <p className="text-xs text-muted-foreground" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
