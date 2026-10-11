"use client";

import type { ReactNode } from "react";
import { FormLabel } from "@/components/forms/form-label";
import { FormControlRow } from "@/components/forms/form-control-row";
import { ReadOnlyHint } from "@/components/forms/read-only-hint";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";

export function RecordDetailField({
  fieldId,
  inputId,
  label,
  required,
  action,
  readOnlyHint,
  children,
}: {
  fieldId: string;
  inputId?: string;
  label: string;
  required?: boolean;
  action?: ReactNode;
  readOnlyHint?: boolean;
  children: ReactNode;
}) {
  return (
    <EntityDetailField fieldId={fieldId}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FormLabel htmlFor={inputId}>
            {label}

            {required && <span className="text-destructive"> *</span>}
          </FormLabel>

          {action}

          <EntityDetailFieldActions fieldId={fieldId} label={label} />
        </div>

        <FormControlRow startAddon={<EntityDetailFieldDragHandle label={label} />}>
          {readOnlyHint ? <ReadOnlyHint>{children}</ReadOnlyHint> : children}
        </FormControlRow>
      </div>
    </EntityDetailField>
  );
}
