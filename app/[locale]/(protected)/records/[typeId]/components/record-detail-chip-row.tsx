"use client";

import type { ReactNode } from "react";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { PinOff, Plus } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { runUserAction } from "@/core/errors/report-application-error";
import { useEntityDetailPersonalization } from "@/components/entity-detail/entity-detail-personalization";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { RecordValueTypeIcon } from "@/components/records/record-value-type-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { recordColumns } from "@/features/records/record-columns";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { type RecordChipColumn, type RecordChipEntry, recordChipRowModel } from "./record-chip-row-model";
import { RecordPropertyChipView } from "./record-chip-row";
import { RecordInputField } from "./record-input-field";
import { RecordRelationshipEditor, useRecordChoices } from "./record-relationship-editor";

const CHIP_TRIGGER_CLASS =
  "inline-flex max-w-full min-w-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

function columnIcon(store: RecordEditorStore, column: RecordChipColumn) {
  if (column.kind === "field") return <RecordValueTypeIcon valueType={column.field.valueType} />;
  if (column.kind === "relationship" || column.kind === "relationshipPath") {
    const typeId =
      column.kind === "relationshipPath"
        ? column.targetTypeId
        : column.direction === "outgoing"
          ? column.relation.targetTypeId
          : column.relation.sourceTypeId;
    return <RecordChipIcon icons={store.presentation.linkIcons} typeId={typeId} />;
  }
  return <RecordValueTypeIcon valueType={column.kind === "system" ? "dateTime" : "text"} />;
}

function draftRow(store: RecordEditorStore): RecordRow {
  const record = store.record;
  const known = [
    ...(record?.assignedUsers ?? []),
    ...(store.rootStore.userStore.user ? [store.rootStore.userStore.user] : []),
  ];
  return {
    ...(record ?? { ref: { typeId: store.presentation.typeId, recordId: "" }, relationships: [], memberUsers: [] }),
    id: record?.ref.recordId ?? "",
    fields: store.presentation.model.fields
      .filter((field) => field.typeId === store.presentation.typeId)
      .map((field) => ({ fieldId: field.id, result: store.previewValue(field) })),
    assignedUsers: store.form.assignedUserIds.flatMap((id) => known.find((user) => user.id === id) ?? []),
    identities: store.form.identities.map((entry, index) => ({
      ...entry,
      id: String(index),
      profileUrl: entry.profileUrl ?? null,
      displayName: entry.displayName ?? null,
    })),
  } as RecordRow;
}

const LinkedChip = observer(function LinkedChip({
  store,
  entry,
  row,
}: {
  store: RecordEditorStore;
  entry: RecordChipEntry;
  row: RecordRow;
}) {
  const column = entry.column;
  if (column.kind !== "relationship" && column.kind !== "relationshipPath") return null;
  const typeId =
    column.kind === "relationshipPath"
      ? column.targetTypeId
      : column.direction === "outgoing"
        ? column.relation.targetTypeId
        : column.relation.sourceTypeId;
  return <LinkedChipQuery column={column} entry={entry} row={row} store={store} typeId={typeId} />;
});

const LinkedChipQuery = observer(function LinkedChipQuery({
  store,
  entry,
  row,
  column,
  typeId,
}: {
  store: RecordEditorStore;
  entry: RecordChipEntry;
  row: RecordRow;
  column: Extract<RecordChipColumn, { kind: "relationship" | "relationshipPath" }>;
  typeId: string;
}) {
  const query = useRecordChoices(
    {
      typeId,
      page: 1,
      pageSize: 10,
      ...(store.record
        ? column.kind === "relationshipPath"
          ? { throughPath: { ref: store.record.ref, pathId: column.definition.id } }
          : { linkedTo: { ref: store.record.ref, relationId: column.relation.id, direction: column.direction } }
        : {}),
    },
    store.record !== null && store.isOpen,
    store.record?.version ?? 0,
  );
  const changes =
    column.kind === "relationship"
      ? store.form.linkChanges.filter(
          (change) => change.relationId === column.relation.id && change.direction === column.direction,
        )
      : [];
  const original = query.data?.records ?? [];
  const records: RecordChoice[] = [
    ...original.filter(
      (record) =>
        !changes.some((change) => change.action === "unlink" && change.record.recordId === record.ref.recordId),
    ),
    ...changes
      .filter(
        (change) =>
          change.action === "link" && !original.some((record) => record.ref.recordId === change.record.recordId),
      )
      .map((change) => ({ ref: change.record, title: change.title })),
  ];
  const hidden = Math.max(0, (query.data?.total ?? 0) - original.length);
  const summary = { records, readableCount: records.length + hidden, hasMore: hidden > 0 };
  if (!records.length) return <PlaceholderChip column={column} store={store} />;
  const linkedRow = {
    ...row,
    relationships:
      column.kind === "relationship"
        ? [{ relationId: column.relation.id, direction: column.direction, ...summary }]
        : row.relationships,
    relationshipPaths:
      column.kind === "relationshipPath" ? [{ pathId: column.definition.id, ...summary }] : row.relationshipPaths,
  } as RecordRow;
  return <RecordPropertyChipView entry={entry} presentation={store.presentation} record={linkedRow} />;
});

function PlaceholderChip({ store, column }: { store: RecordEditorStore; column: RecordChipColumn }) {
  return (
    <AppChip className="text-muted-foreground" data-placeholder-chip="" startContent={columnIcon(store, column)}>
      {column.label}
    </AppChip>
  );
}

function editsInChip(store: RecordEditorStore, column: RecordChipColumn) {
  if (store.isReadOnly) return false;
  if (column.kind === "field") return isRecordFieldWritable(column.field) && column.field.valueType !== "richText";
  if (column.kind === "relationship") {
    return !store.presentation.model.types.some(
      (type) => type.embedded && type.parentRelationshipId === column.relation.id,
    );
  }
  return false;
}

const DetailChip = observer(function DetailChip({
  store,
  entry,
  row,
  readOnly,
}: {
  store: RecordEditorStore;
  entry: RecordChipEntry;
  row: RecordRow;
  readOnly: boolean;
}) {
  const t = useTranslations();
  const { toggleStarredField } = useEntityDetailPersonalization();
  const [open, setOpen] = useState(false);
  const column = entry.column;
  if (column.id === "system:assignedTo") {
    return (
      <AppChipStack
        items={row.assignedUsers.map((member) => ({
          id: member.id,
          label: memberName(member),
          startContent: <MemberAvatar member={member} />,
        }))}
        onChipClick={(item) => runUserAction(() => store.rootStore.userModalStore.loadById(item.id))}
      />
    );
  }
  const chip: ReactNode =
    column.kind === "relationship" || column.kind === "relationshipPath" ? (
      <LinkedChip entry={entry} row={row} store={store} />
    ) : entry.empty ? (
      <PlaceholderChip column={column} store={store} />
    ) : (
      <RecordPropertyChipView entry={entry} presentation={store.presentation} record={row} />
    );
  if (readOnly || !editsInChip(store, column)) return chip;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("RecordModel.editValue", { field: column.label })}
          className={CHIP_TRIGGER_CLASS}
          data-detail-chip={column.id}
          type="button"
        >
          {chip}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium text-muted-foreground">{column.label}</p>

          <IconButton
            fieldAction
            icon={PinOff}
            label={t("EntityDetail.unpinField", { field: column.label })}
            onClick={() => {
              setOpen(false);
              toggleStarredField(column.id);
            }}
          />
        </div>

        {column.kind === "field" ? (
          <RecordInputField field={column.field} id={`values.${column.field.id}`} label={null} />
        ) : column.kind === "relationship" ? (
          <RecordRelationshipEditor direction={column.direction} relationship={column.relation} store={store} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
});

const PinChip = observer(function PinChip({
  store,
  columns,
}: {
  store: RecordEditorStore;
  columns: RecordChipColumn[];
}) {
  const t = useTranslations();
  const { toggleStarredField } = useEntityDetailPersonalization();
  if (!columns.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={t("EntityDetail.pinMore")} className={CHIP_TRIGGER_CLASS} data-pin-chip="" type="button">
          <AppChip interactive className="border-dashed border-border bg-transparent text-muted-foreground">
            <Plus aria-hidden className="size-3" />
          </AppChip>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {columns.map((column) => (
          <DropdownMenuItem key={column.id} onSelect={() => toggleStarredField(column.id)}>
            {columnIcon(store, column)}

            {column.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export const RecordDetailChipRow = observer(function RecordDetailChipRow({
  store,
  className,
}: {
  store: RecordEditorStore;
  className?: string;
}) {
  const t = useTranslations();
  const { starredFieldIds, isPersonalizing } = useEntityDetailPersonalization();
  const all = recordColumns(store.presentation.typeId, store.presentation.model)
    .filter((column) => store.record || column.kind !== "system" || column.id === "system:assignedTo")
    .map((column) =>
      column.kind === "system"
        ? { ...column, label: t(`RecordModel.${column.label}`) }
        : column.kind === "identity"
          ? { ...column, label: t("EntityChannels.heading") }
          : column,
    ) as RecordChipColumn[];
  const byId = new Map(all.map((column) => [column.id, column]));
  const pinned = starredFieldIds.flatMap((id) => byId.get(id) ?? []);
  const row = draftRow(store);
  const { entries } = recordChipRowModel(pinned, row, { keepEmpty: true });
  const unpinned = all.filter((column) => !starredFieldIds.includes(column.id));
  if (!entries.length && (isPersonalizing || !unpinned.length)) return null;
  return (
    <div className={className} data-record-chip-row="">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {entries.map((entry) => (
          <span
            key={entry.column.id}
            aria-label={entry.column.label}
            className="inline-flex max-w-full min-w-0"
            data-chip-column={entry.column.id}
            role="group"
          >
            <DetailChip entry={entry} readOnly={isPersonalizing} row={row} store={store} />
          </span>
        ))}

        {!isPersonalizing && <PinChip columns={unpinned} store={store} />}
      </div>
    </div>
  );
});
