"use client";

import type { ReactNode } from "react";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";

import { FormFieldHelp } from "./form-field-help";
import { FormLabel } from "./form-label";
import { FormOutput } from "./form-output";

type Props = {
  label: string;
  children: ReactNode;
  help?: ReactNode;
  description?: ReactNode;
  labelEndAddon?: ReactNode;
  className?: string;
  outputClassName?: string;
};

export function FormOutputField({
  label,
  children,
  help,
  description,
  labelEndAddon,
  className,
  outputClassName,
}: Props) {
  const t = useTranslations();
  const labelId = useId();
  const descriptionId = useId();

  return (
    <div data-form-output-field className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <FormLabel id={labelId}>{label}</FormLabel>

        {help ? (
          <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: label })}>{help}</FormFieldHelp>
        ) : null}

        {labelEndAddon}
      </div>

      <FormOutput
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={labelId}
        className={outputClassName}
      >
        {children}
      </FormOutput>

      {description ? (
        <p className="text-xs text-muted-foreground" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
