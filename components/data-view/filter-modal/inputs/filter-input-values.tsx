"use client";

import { useId, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { AppChip } from "@/components/chip/app-chip";
import { useAppForm } from "@/components/forms/form-context";
import { useFilterFieldLabel } from "@/components/data-view/use-filter-field-label";
import { validScalarFilterValue } from "./scalar-filter-values";

export const FilterInputValues = observer(function FilterInputValues({
  id,
  field,
  customColumns,
}: {
  id: string;
  field: string;
  customColumns?: ColumnPresentation[];
}) {
  const store = useAppForm();
  const t = useTranslations();
  const label = useFilterFieldLabel();
  const labelId = useId();
  const [rejected, setRejected] = useState<string[] | undefined>();
  const column = customColumns?.find((item) => item.id === field);
  const current = store?.getValue(id);
  const value =
    rejected ?? (Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : []);
  return (
    <div className="space-y-2">
      <span className="sr-only" id={labelId}>
        {label(field, customColumns)}
      </span>

      <FormInputChips
        arrayMode
        ariaLabelledBy={labelId}
        disabled={store?.isDisabled}
        id={id}
        label={null}
        renderChip={(item, endContent) => (
          <AppChip endContent={endContent} variant={validScalarFilterValue(item, column) ? "secondary" : "destructive"}>
            {item}
          </AppChip>
        )}
        value={value}
        onValueChange={(next) => {
          if (next.length > 100 || next.some((item) => !validScalarFilterValue(item, column))) {
            setRejected(next);
            return;
          }
          setRejected(undefined);
          store?.onChange(id, next);
        }}
      />

      {rejected && (
        <p className="text-xs text-destructive" role="alert">
          {rejected.length > 100
            ? t("Common.filters.selectionLimit", { count: 100 })
            : t("Common.errors.invalidFilterValue")}
        </p>
      )}
    </div>
  );
});
