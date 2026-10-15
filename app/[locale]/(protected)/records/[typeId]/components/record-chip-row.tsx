"use client";

import type { ReactNode } from "react";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { DataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { CLICK_ACTION_VALUE_TYPES } from "@/features/records/record-model-validation";
import { formattedTextExcerpt, RecordValue } from "@/components/records/record-value";
import { ITEM_REVEAL_CLASS } from "@/components/ui/item-actions";
import { cn } from "@/core/utils/cn";
import {
  RecordInlineField,
  RecordInlineRelationship,
  RecordPropertyEditor,
  canEditInline,
  focusFirstControl,
  hasInlineRelationshipEditor,
} from "./record-inline-field";
import { type RecordChipColumn, type RecordChipEntry, recordChipRowModel } from "./record-chip-row-model";
import {
  AddChip,
  CHIP_TRIGGER_CLASS,
  ChipColumnIcon,
  RecordChipList,
  RecordPropertyChipView,
  chipPopoverClass,
} from "./record-chip";

const PropertyChip = observer(function PropertyChip({
  records,
  record,
  entry,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  entry: RecordChipEntry;
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const { column } = entry;
  const chip = <RecordPropertyChipView entry={entry} presentation={records.presentation} record={record} />;
  if (column.kind === "field") {
    const field = column.field;
    if (!canEditInline(records, record, field) || field.valueType === "boolean") return chip;
    if (CLICK_ACTION_VALUE_TYPES.includes(field.valueType)) return chip;
    return (
      <RecordInlineField field={field} record={record} records={records}>
        {chip}
      </RecordInlineField>
    );
  }
  if (column.kind === "relationship" && hasInlineRelationshipEditor(records, record, column.relation)) {
    return (
      <RecordInlineRelationship
        direction={column.direction}
        empty={false}
        label={column.label}
        record={record}
        records={records}
        relation={column.relation}
        onOpenRecord={onOpenRecord}
      >
        {chip}
      </RecordInlineRelationship>
    );
  }
  return chip;
});

function editableAddColumns(
  records: RecordsStore,
  record: RecordRow,
  columns: RecordChipColumn[],
  empty: RecordChipColumn[],
) {
  const emptyIds = new Set(empty.map((column) => column.id));
  return columns.filter((column) => {
    if (column.kind === "field") {
      if (!canEditInline(records, record, column.field)) return false;
      return (
        emptyIds.has(column.id) ||
        CLICK_ACTION_VALUE_TYPES.includes(column.field.valueType) ||
        column.field.valueType === "boolean"
      );
    }
    if (column.kind === "relationship")
      return emptyIds.has(column.id) && hasInlineRelationshipEditor(records, record, column.relation);
    return false;
  });
}

const AddPropertyChip = observer(function AddPropertyChip({
  records,
  record,
  columns,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  columns: RecordChipColumn[];
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState<RecordChipColumn | null>(null);
  const { linkIcons } = records.presentation;
  return (
    <Popover modal open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("RecordModel.addProperty")}
              className={cn(ITEM_REVEAL_CLASS, CHIP_TRIGGER_CLASS, "data-[state=open]:opacity-100")}
              data-add-property=""
              type="button"
              onClick={(event) => event.stopPropagation()}
            >
              <AddChip label={t("RecordModel.addProperty")} />
            </button>
          </DropdownMenuTrigger>
        </PopoverAnchor>

        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {columns.map((column) => (
            <DropdownMenuItem key={column.id} onSelect={() => setEditing(column)}>
              <ChipColumnIcon column={column} icons={linkIcons} />

              {column.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <PopoverContent
        align="start"
        className={chipPopoverClass(editing?.kind === "relationship")}
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={focusFirstControl}
      >
        {editing && (
          <RecordPropertyEditor
            column={editing}
            record={record}
            records={records}
            onDone={() => setEditing(null)}
            onOpenRecord={onOpenRecord}
          />
        )}
      </PopoverContent>
    </Popover>
  );
});

const RecordChipRow = observer(function RecordChipRow({
  records,
  record,
  columns,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  columns: RecordChipColumn[];
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const { entries, empty } = recordChipRowModel(columns, record);
  const addable = editableAddColumns(records, record, columns, empty);
  if (!entries.length && !addable.length) return null;
  return (
    <DataViewItemLayout.Provider value="card">
      <RecordChipList
        entries={entries}
        renderChip={(entry) => (
          <PropertyChip entry={entry} record={record} records={records} onOpenRecord={onOpenRecord} />
        )}
      >
        {addable.length > 0 && (
          <AddPropertyChip columns={addable} record={record} records={records} onOpenRecord={onOpenRecord} />
        )}
      </RecordChipList>
    </DataViewItemLayout.Provider>
  );
});

export const RecordCardContent = observer(function RecordCardContent({
  records,
  record,
  title,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  title: ReactNode;
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const byId = new Map(records.recordColumns.map((column) => [column.id, column]));
  const hidden = new Set([
    records.primaryColumnId,
    records.groupingResult?.grouping.field,
    records.groupingResult?.columnId,
  ]);
  const columns = records.visibleColumns.flatMap((column) => {
    const recordColumn = byId.get(column.uid);
    return recordColumn && !hidden.has(column.uid) ? [recordColumn] : [];
  });
  const isFormattedText = (column: RecordChipColumn) =>
    column.kind === "field" && column.field.valueType === "richText";
  const excerpts = columns.flatMap((column) => {
    if (column.kind !== "field" || !isFormattedText(column)) return [];
    const result = record.fields.find((value) => value.fieldId === column.field.id)?.result;
    if (result?.state !== "value" || result.value.kind !== "richText") return [];
    return formattedTextExcerpt(result.value.documentJson) ? [{ field: column.field, result }] : [];
  });
  return (
    <div className="space-y-2">
      <div className="pr-6 text-sm font-medium [&_.truncate]:line-clamp-3 [&_.truncate]:whitespace-normal">{title}</div>

      {excerpts.map(({ field, result }) => (
        <div key={field.id} className="text-xs" data-card-excerpt={field.id}>
          <RecordValue wrap field={field} result={result} />
        </div>
      ))}

      <RecordChipRow
        columns={columns.filter((column) => !isFormattedText(column))}
        record={record}
        records={records}
        onOpenRecord={onOpenRecord}
      />
    </div>
  );
});
