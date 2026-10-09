"use client";

import type { ReactNode } from "react";

import { FormOutputField } from "@/components/forms/form-output-field";
import { EmptyValue } from "@/components/shared/empty-value";

import { EntityDetailField } from "./entity-detail-field";
import { EntityDetailFieldActions } from "./entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "./entity-detail-fields";

type Props = {
  fieldId: string;
  label: string;
  value: ReactNode;
  help?: ReactNode;
  action?: ReactNode;
};

export function EntityDetailStaticField({ fieldId, label, value, help, action }: Props) {
  const displayValue = value === null || value === undefined || value === "" ? <EmptyValue /> : value;

  return (
    <EntityDetailField fieldId={fieldId}>
      <FormOutputField
        controlStartAddon={<EntityDetailFieldDragHandle label={label} />}
        help={help}
        label={label}
        labelEndAddon={
          <>
            {action}

            <EntityDetailFieldActions fieldId={fieldId} label={label} />
          </>
        }
      >
        <span suppressHydrationWarning className="select-text truncate">
          {displayValue}
        </span>
      </FormOutputField>
    </EntityDetailField>
  );
}
