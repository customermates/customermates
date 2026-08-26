"use client";

import type { ReactNode } from "react";

import { FormLabel } from "@/components/forms/form-label";

import { EntityDetailStarButton } from "./entity-detail-star-button";

type Props = {
  fieldId: string;
  label: string;
  value: ReactNode;
};

export function EntityDetailStaticField({ fieldId, label, value }: Props) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <FormLabel>{label}</FormLabel>

        <EntityDetailStarButton fieldId={fieldId} label={label} />
      </div>

      <div
        className="flex min-h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-foreground shadow-xs"
        data-read-only="true"
      >
        <span suppressHydrationWarning className="select-text truncate">
          {displayValue}
        </span>
      </div>
    </div>
  );
}
