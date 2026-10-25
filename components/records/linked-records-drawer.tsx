"use client";

import type { LinkedRecordsSelection } from "@/core/stores/record-workspace.store";

import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ScopedRecordsSheet } from "@/components/records/scoped-records-sheet";
import { linkedRecordsFilter } from "@/features/records/linked-records-link";

export const LinkedRecordsDrawer = observer(function LinkedRecordsDrawer({
  selection,
  open,
  onClose,
}: {
  selection: LinkedRecordsSelection;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { source, link, targetTypeId } = selection;
  const filter = useMemo(() => linkedRecordsFilter(source, link), [source, link]);
  return (
    <ScopedRecordsSheet
      closeOnOpen
      emptyTitle={t("RecordModel.noLinkedRecords")}
      fallback={selection.fallback}
      filter={filter}
      idPrefix="linked-records"
      open={open}
      opener={selection.opener}
      summary={(store) =>
        store
          ? t("RecordModel.linkedRecordsSummary", {
              count: store.pagination?.total ?? store.items.length,
              name: selection.sourceName,
            })
          : selection.sourceName
      }
      title={selection.label}
      typeId={targetTypeId}
      onClose={onClose}
    />
  );
});
