"use client";

import type { ReactNode } from "react";

import { FormControlRow } from "@/components/forms/form-control-row";
import { FormLabel } from "@/components/forms/form-label";
import { FormOutputField } from "@/components/forms/form-output-field";
import { EmptyValue } from "@/components/shared/empty-value";

import { EntityDetailField } from "./entity-detail-field";
import { EntityDetailFieldActions } from "./entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "./entity-detail-fields";

type Props = {
  fieldId: string;
  label: string;
  action?: ReactNode;
  locked?: boolean;
} & (
  | { children: ReactNode; inputId?: string; required?: boolean }
  | { value: ReactNode; help?: ReactNode; derivation?: ReactNode }
);

export function EntityDetailFieldShell(props: Props) {
  const { fieldId, label, action, locked } = props;
  const dragHandle = <EntityDetailFieldDragHandle label={label} />;
  const labelEnd = (
    <>
      {action}

      <EntityDetailFieldActions fieldId={fieldId} label={label} />
    </>
  );

  if ("value" in props) {
    const { value } = props;

    return (
      <EntityDetailField fieldId={fieldId}>
        <FormOutputField
          controlEndAddon={props.derivation}
          controlStartAddon={dragHandle}
          help={props.help}
          label={label}
          labelEndAddon={labelEnd}
          locked={locked}
        >
          <span suppressHydrationWarning className="select-text truncate">
            {value === null || value === undefined || value === "" ? <EmptyValue /> : value}
          </span>
        </FormOutputField>
      </EntityDetailField>
    );
  }

  return (
    <EntityDetailField fieldId={fieldId}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FormLabel htmlFor={props.inputId}>
            {label}

            {props.required && <span className="text-destructive"> *</span>}
          </FormLabel>

          {labelEnd}
        </div>

        <FormControlRow startAddon={dragHandle}>
          {locked ? (
            <div className="w-full min-w-0 cursor-not-allowed" data-field-locked="">
              {props.children}
            </div>
          ) : (
            props.children
          )}
        </FormControlRow>
      </div>
    </EntityDetailField>
  );
}
