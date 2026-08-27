"use client";

import type { ReactNode } from "react";

import { FormOutputField } from "@/components/forms/form-output-field";

import { EntityDetailPinButton } from "./entity-detail-pin-button";

type Props = {
  fieldId: string;
  label: string;
  value: ReactNode;
  help?: ReactNode;
};

export function EntityDetailStaticField({ fieldId, label, value, help }: Props) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;

  return (
    <FormOutputField
      help={help}
      label={label}
      labelEndAddon={<EntityDetailPinButton fieldId={fieldId} label={label} />}
    >
      <span suppressHydrationWarning className="select-text truncate">
        {displayValue}
      </span>
    </FormOutputField>
  );
}
