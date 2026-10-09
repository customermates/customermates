"use client";

import type { ReactNode } from "react";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CalendarClock, Plus } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { DataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { RecordValueTypeIcon } from "@/components/records/record-value-type-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { toChipColor } from "@/constants/chip-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { recordLinkColor } from "@/features/records/record-presentation";
import { CONTACT_VALUE_TYPES } from "@/features/records/record-model-validation";
import { RecordValue } from "./record-value";
import {
  RecordInlineField,
  RecordInlineRelationship,
  RecordPropertyEditor,
  calculatedFieldLabel,
  canEditInline,
  hasInlineRelationshipEditor,
  isCalculatedField,
} from "./record-inline-field";
import { type RecordChipColumn, type RecordChipEntry, linkSummary, recordChipRowModel } from "./record-chip-row-model";

function ChipLabel({ name, children }: { name?: string; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      {name && <span className="max-w-20 shrink-0 truncate text-muted-foreground">{name}</span>}

      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

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
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const { column, showName } = entry;
  const name = showName ? column.label : undefined;
  const { linkColors, linkIcons } = records.presentation;
  if (column.kind === "field") {
    const field = column.field;
    const result = record.fields.find((value) => value.fieldId === field.id)?.result;
    const icon = <RecordValueTypeIcon valueType={field.valueType} />;
    let chip: ReactNode;
    if (result?.state === "value" && result.value.kind === "select") {
      const value = result.value.value;
      const option = field.options.find((candidate) => candidate.id === value);
      chip = (
        <AppChip startContent={icon} tooltip={field.label} variant={toChipColor(option?.color)}>
          <ChipLabel name={name}>{option?.label ?? t("RecordModel.unavailableOption")}</ChipLabel>
        </AppChip>
      );
    } else if (result?.state === "value" && result.value.kind === "member") {
      const memberId = result.value.value;
      const member = record.memberUsers.find((user) => user.id === memberId);
      chip = (
        <AppChip startContent={member ? <MemberAvatar member={member} /> : icon} tooltip={field.label}>
          <ChipLabel name={name}>{member ? memberName(member) : t("RecordModel.member")}</ChipLabel>
        </AppChip>
      );
    } else if (field.valueType === "channels") {
      chip = (
        <span className="inline-flex max-w-full min-w-0 items-center gap-1">
          {icon}

          <RecordValue field={field} identities={record.identities} overflowMenu={false} result={result} />
        </span>
      );
    } else if (result?.state === "value" && result.value.kind === "selectList") {
      chip = (
        <span className="inline-flex max-w-full min-w-0 items-center gap-1">
          {icon}

          <RecordValue field={field} members={record.memberUsers} overflowMenu={false} result={result} />
        </span>
      );
    } else if (result?.state === "value" && result.value.kind === "boolean") {
      chip = (
        <AppChip startContent={icon} tooltip={field.label}>
          {field.label}
        </AppChip>
      );
    } else {
      chip = (
        <AppChip
          startContent={icon}
          tooltip={
            isCalculatedField(records, field) ? calculatedFieldLabel(field, records.presentation.model, t) : field.label
          }
        >
          <ChipLabel name={name}>
            <RecordValue compact field={field} members={record.memberUsers} result={result} />
          </ChipLabel>
        </AppChip>
      );
    }
    if (!canEditInline(records, record, field) || field.valueType === "boolean") return chip;
    if (CONTACT_VALUE_TYPES.includes(field.valueType)) return chip;
    return (
      <RecordInlineField field={field} record={record} records={records}>
        {chip}
      </RecordInlineField>
    );
  }
  if (column.kind === "relationship" || column.kind === "relationshipPath") {
    const summary = linkSummary(record, column);
    if (!summary?.records.length) return null;
    const first = summary.records[0];
    const typeId = first.ref.typeId;
    const list = records.presentation.model.types.find((type) => type.id === typeId);
    const title =
      first.title.state === "value" && first.title.value.kind === "text"
        ? first.title.value.value
        : first.title.state === "restricted"
          ? t("RecordModel.restricted")
          : t("RecordModel.record");
    const count = Math.max(summary.readableCount, summary.records.length);
    const chip = (
      <AppChip
        data-chip-id={count === 1 ? `${first.ref.typeId}:${first.ref.recordId}` : undefined}
        startContent={<RecordChipIcon icons={linkIcons} typeId={typeId} />}
        tooltip={column.label}
        variant={recordLinkColor(linkColors, typeId)}
      >
        <ChipLabel name={name}>{count === 1 ? title : `${count} ${list?.pluralLabel ?? column.label}`}</ChipLabel>
      </AppChip>
    );
    if (column.kind !== "relationship" || !hasInlineRelationshipEditor(records, record, column.relation)) return chip;
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
  if (column.kind === "system" && column.id === "system:assignedTo") {
    return (
      <AppChipStack
        items={record.assignedUsers.map((member) => ({
          id: member.id,
          label: memberName(member),
          startContent: <MemberAvatar member={member} />,
        }))}
      />
    );
  }
  if (column.kind === "system") {
    const instant = column.id === "system:createdAt" ? record.createdAt : record.updatedAt;
    return (
      <AppChip startContent={<CalendarClock aria-hidden className="size-3" />} tooltip={column.label}>
        <ChipLabel name={name}>
          <time dateTime={instant}>{intl.formatDescriptiveShortDate(new Date(instant))}</time>
        </ChipLabel>
      </AppChip>
    );
  }
  return null;
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
  const { linkIcons } = records.presentation;
  return (
    <Popover modal open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
      <DropdownMenu>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("RecordModel.addProperty")}
              className="inline-flex rounded-md opacity-0 outline-none transition-opacity group-hover/card:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 data-[state=open]:opacity-100 any-pointer-coarse:opacity-100"
              data-add-property=""
              type="button"
              onClick={(event) => event.stopPropagation()}
            >
              <AppChip interactive className="border-dashed border-border bg-transparent text-muted-foreground">
                <Plus aria-hidden className="size-3" />
              </AppChip>
            </button>
          </DropdownMenuTrigger>
        </PopoverAnchor>

        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {columns.map((column) => (
            <DropdownMenuItem key={column.id} onSelect={() => setEditing(column)}>
              {column.kind === "field" ? (
                <RecordValueTypeIcon className="size-4" valueType={column.field.valueType} />
              ) : column.kind === "relationship" ? (
                <RecordChipIcon
                  icons={linkIcons}
                  typeId={column.direction === "outgoing" ? column.relation.targetTypeId : column.relation.sourceTypeId}
                />
              ) : null}

              {column.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <PopoverContent
        align="start"
        className={editing?.kind === "relationship" ? "w-72 p-0" : "w-80 space-y-2 p-3"}
        onClick={(event) => event.stopPropagation()}
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

export const RecordChipRow = observer(function RecordChipRow({
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
      <div className="flex min-w-0 flex-wrap items-center gap-1" data-chip-row="">
        {entries.map((entry) => (
          <span
            key={entry.column.id}
            aria-label={entry.column.label}
            className="inline-flex max-w-full min-w-0"
            data-chip-column={entry.column.id}
            role="group"
          >
            <PropertyChip entry={entry} record={record} records={records} onOpenRecord={onOpenRecord} />
          </span>
        ))}

        {addable.length > 0 && (
          <AddPropertyChip columns={addable} record={record} records={records} onOpenRecord={onOpenRecord} />
        )}
      </div>
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
  const hidden = new Set([records.primaryColumnId, records.groupingResult?.columnId]);
  const columns = records.visibleColumns.flatMap((column) => {
    const recordColumn = byId.get(column.uid);
    return recordColumn && !hidden.has(column.uid) ? [recordColumn] : [];
  });
  return (
    <div className="space-y-2">
      <div className="pr-6 text-sm font-medium [&_.truncate]:line-clamp-3 [&_.truncate]:whitespace-normal">{title}</div>

      <RecordChipRow columns={columns} record={record} records={records} onOpenRecord={onOpenRecord} />
    </div>
  );
});
