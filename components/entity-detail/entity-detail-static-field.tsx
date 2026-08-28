"use client";

import type { ReactNode } from "react";

import { FormOutputField } from "@/components/forms/form-output-field";

import { EntityDetailField } from "./entity-detail-field";
import { EntityDetailFieldActions } from "./entity-detail-field-actions";

type Props = {
  fieldId: string;
  label: string;
  value: ReactNode;
  help?: ReactNode;
};

export function EntityDetailStaticField({ fieldId, label, value, help }: Props) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;

  return (
    <EntityDetailField fieldId={fieldId}>
      <FormOutputField
        help={help}
        label={label}
        labelEndAddon={<EntityDetailFieldActions fieldId={fieldId} label={label} />}
      >
        <span suppressHydrationWarning className="select-text truncate">
          {displayValue}
        </span>
      </FormOutputField>
    </EntityDetailField>
  );
}
