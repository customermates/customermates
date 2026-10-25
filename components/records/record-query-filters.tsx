"use client";

import type { RecordModelView } from "@/features/records/record-model.schema";
import type { QueryFilters } from "@/components/records/record-filter-target";
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useAppForm } from "@/components/forms/form-context";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { FilterPaletteInline } from "@/components/data-view/filter-palette/filter-palette-inline";
import { createRecordQueryFilterTarget } from "./record-query-filter-target";

type Props = {
  id: string;
  anchorId: string;
  model: RecordModelView | null | undefined;
  typeId: string;
  inline?: boolean;
};

export const RecordQueryFilters = observer(function RecordQueryFilters({
  id,
  anchorId,
  model,
  typeId,
  inline = false,
}: Props) {
  const store = useAppForm();
  const t = useTranslations();
  const target = useMemo(
    () =>
      model && store
        ? createRecordQueryFilterTarget({
            model,
            typeId,
            labels: {
              createdAt: t("RecordModel.createdAt"),
              updatedAt: t("RecordModel.updatedAt"),
              assignedTo: t("RecordModel.assignedTo"),
              search: t("RecordWidgets.search"),
              records: t("RecordWidgets.groupRecord"),
              any: t("RecordWidgets.relatedAny"),
              none: t("RecordWidgets.relatedNone"),
              unavailable: t("RecordWidgets.unavailable"),
            },
            read: () => (store.getValue(id) as QueryFilters | undefined) ?? { filters: [], relationships: [] },
            write: (query) => store.onChange(id, query),
            isDisabled: () => store.isDisabled,
            identity: () => store.form,
          })
        : null,
    [model, store, id, typeId, t],
  );
  return target ? (
    inline ? (
      <FilterPaletteInline id={anchorId} store={target} />
    ) : (
      <FilterTargetPopover id={anchorId} store={target} />
    )
  ) : null;
});
