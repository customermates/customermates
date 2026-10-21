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
import { OverlayDismissGuardContext, useOwnOverlayDismissGuard } from "@/components/modal/overlay-dismiss-guard";
import { CONTACT_VALUE_TYPES } from "@/features/records/record-model-validation";
import { formattedTextExcerpt, RecordValue } from "@/components/records/record-value";
import { ITEM_REVEAL_CLASS } from "@/components/ui/item-actions";
import { cn } from "@/core/utils/cn";
import {
  RecordInlineField,
  RecordInlineAssignees,
  RecordInlineRelationship,
  RecordPropertyEditor,
  canEditInline,
  canEditAssignees,
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
  onEditingChange,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  entry: RecordChipEntry;
  onEditingChange: (open: boolean) => void;
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const { column } = entry;
  const assigneesEditable = column.id === "system:assignedTo" && canEditAssignees(records, record);
  const chip = (
    <RecordPropertyChipView
      entry={entry}
      inTrigger={assigneesEditable}
      presentation={records.presentation}
      record={record}
    />
  );
  if (assigneesEditable) {
    return (
      <RecordInlineAssignees record={record} records={records} onOpenChange={onEditingChange}>
        {chip}
      </RecordInlineAssignees>
    );
  }
  if (column.kind === "field") {
    const field = column.field;
    if (!canEditInline(records, record, field) || field.valueType === "boolean") return chip;
    if (CONTACT_VALUE_TYPES.includes(field.valueType)) return chip;
    return (
      <RecordInlineField field={field} record={record} records={records} onOpenChange={onEditingChange}>
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
    if (column.id === "system:assignedTo") return emptyIds.has(column.id) && canEditAssignees(records, record);
    if (column.kind === "field") {
      if (!canEditInline(records, record, column.field)) return false;
      return (
        emptyIds.has(column.id) ||
        CONTACT_VALUE_TYPES.includes(column.field.valueType) ||
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
  const dismissGuard = useOwnOverlayDismissGuard();
  const { linkIcons } = records.presentation;
  if (!columns.length && !editing) return null;
  return (
    <Popover
      modal
      open={editing !== null}
      onOpenChange={(open) => !open && !dismissGuard.shouldKeepOpen() && setEditing(null)}
    >
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
        <OverlayDismissGuardContext.Provider value={dismissGuard.guard}>
          {editing && (
            <RecordPropertyEditor
              column={editing}
              record={record}
              records={records}
              onDone={() => setEditing(null)}
              onOpenRecord={onOpenRecord}
            />
          )}
        </OverlayDismissGuardContext.Provider>
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
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const model = recordChipRowModel(columns, record, { keepEmpty: true });
  const entries = model.entries.filter((entry) => !entry.empty || entry.column.id === editingColumn);
  const empty = model.empty;
  const addable = editableAddColumns(records, record, columns, empty);
  return (
    <DataViewItemLayout.Provider value="card">
      <RecordChipList
        entries={entries}
        renderChip={(entry) => (
          <PropertyChip
            entry={entry}
            record={record}
            records={records}
            onEditingChange={(open) => setEditingColumn(open ? entry.column.id : null)}
            onOpenRecord={onOpenRecord}
          />
        )}
      >
        <AddPropertyChip columns={addable} record={record} records={records} onOpenRecord={onOpenRecord} />
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
  const [editingExcerpt, setEditingExcerpt] = useState<string | null>(null);
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
    const hasExcerpt =
      result?.state === "value" && result.value.kind === "richText" && formattedTextExcerpt(result.value.documentJson);
    return hasExcerpt || editingExcerpt === column.id ? [{ field: column.field, result }] : [];
  });
  return (
    <div className="space-y-2">
      <div className="pr-6 text-sm font-medium [&_.truncate]:line-clamp-3 [&_.truncate]:whitespace-normal">{title}</div>

      {excerpts.map(({ field, result }) => (
        <div key={field.id} className="text-xs" data-card-excerpt={field.id}>
          {canEditInline(records, record, field) ? (
            <RecordInlineField
              field={field}
              record={record}
              records={records}
              onOpenChange={(open) => setEditingExcerpt(open ? field.id : null)}
            >
              <RecordValue wrap field={field} result={result} />
            </RecordInlineField>
          ) : (
            <RecordValue wrap field={field} result={result} />
          )}
        </div>
      ))}

      <RecordChipRow
        columns={columns.filter(
          (column) => !isFormattedText(column) || recordChipRowModel([column], record).empty.length > 0,
        )}
        record={record}
        records={records}
        onOpenRecord={onOpenRecord}
      />
    </div>
  );
});
