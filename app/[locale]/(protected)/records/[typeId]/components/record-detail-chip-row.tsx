"use client";

import type { ReactNode } from "react";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";

import { useCallback, useId, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import {
  type EntityDetailPreviewItem,
  useEntityDetailPersonalization,
} from "@/components/entity-detail/entity-detail-personalization";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { recordColumns } from "@/features/records/record-columns";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { CLICK_ACTION_VALUE_TYPES } from "@/features/records/record-model-validation";
import { getActiveUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { type RecordChipColumn, type RecordChipEntry, recordChipRowModel } from "./record-chip-row-model";
import {
  AddChip,
  CHIP_TRIGGER_CLASS,
  ChipColumnIcon,
  IdentityChips,
  RecordChipList,
  RecordPropertyChipView,
  chipPopoverClass,
  linkTypeId,
} from "./record-chip";
import { RecordChannelPopover } from "./record-identity-editor";
import { focusFirstControl, RecordLinkPicker } from "./record-inline-field";
import { RecordInputField } from "./record-input-field";
import { useRecordChoices } from "@/components/records/use-record-choices";

type LinkColumn = Extract<RecordChipColumn, { kind: "relationship" | "relationshipPath" }>;

function previewUsers(items: EntityDetailPreviewItem[] | undefined) {
  return (items ?? []).flatMap((item) =>
    item.data && typeof item.data === "object" && "id" in item.data
      ? [item.data as RecordRow["assignedUsers"][number]]
      : [],
  );
}

function draftRow(store: RecordEditorStore, assigneePreview: EntityDetailPreviewItem[] | undefined): RecordRow {
  const record = store.record;
  const known = [
    ...previewUsers(assigneePreview),
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

function useLinkedChoices(store: RecordEditorStore, column: LinkColumn) {
  const [attempt, setAttempt] = useState(0);
  const query = useRecordChoices(
    {
      typeId: linkTypeId(column),
      page: 1,
      pageSize: 10,
      ...(store.record
        ? column.kind === "relationshipPath"
          ? { throughPath: { ref: store.record.ref, pathId: column.definition.id } }
          : { linkedTo: { ref: store.record.ref, relationId: column.relation.id, direction: column.direction } }
        : {}),
    },
    store.record !== null && store.isOpen && !store.trash,
    (store.record?.version ?? 0) + attempt,
  );
  const changes =
    column.kind === "relationship"
      ? store.form.linkChanges.filter(
          (change) => change.relationId === column.relation.id && change.direction === column.direction,
        )
      : [];
  const own =
    column.kind === "relationship"
      ? store.record?.relationships.find(
          (summary) => summary.relationId === column.relation.id && summary.direction === column.direction,
        )
      : store.record?.relationshipPaths?.find((summary) => summary.pathId === column.definition.id);
  const original = (store.trash ? own?.records : query.data?.records) ?? [];
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
  const hidden = store.trash
    ? Math.max(0, (own?.readableCount ?? 0) - original.length)
    : Math.max(0, (query.data?.total ?? 0) - original.length);
  return {
    records,
    loading: store.record !== null && query.loading,
    failed: query.failed,
    retry: () => setAttempt((value) => value + 1),
    summary: { records, readableCount: records.length + hidden, hasMore: hidden > 0 },
  };
}

function PlaceholderChip({ store, column }: { store: RecordEditorStore; column: RecordChipColumn }) {
  return (
    <AppChip
      className="text-muted-foreground"
      data-placeholder-chip=""
      startContent={<ChipColumnIcon column={column} icons={store.presentation.linkIcons} />}
    >
      {column.label}
    </AppChip>
  );
}

function ChipPopover({
  label,
  chip,
  wide = false,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  chip: ReactNode;
  wide?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button aria-label={t("RecordModel.editValue", { field: label })} className={CHIP_TRIGGER_CLASS} type="button">
          {chip}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className={chipPopoverClass(wide)} onOpenAutoFocus={focusFirstControl}>
        {open && children}
      </PopoverContent>
    </Popover>
  );
}

function EditorHeading({ label }: { label: string }) {
  return <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>;
}

const LinkedChip = observer(function LinkedChip({
  store,
  entry,
  row,
  editable,
}: {
  store: RecordEditorStore;
  entry: RecordChipEntry;
  row: RecordRow;
  editable: boolean;
}) {
  const column = entry.column as LinkColumn;
  const [open, setOpen] = useState(false);
  const linked = useLinkedChoices(store, column);
  if (linked.loading && !open) return null;
  const linkedRow = {
    ...row,
    relationships:
      column.kind === "relationship"
        ? [{ relationId: column.relation.id, direction: column.direction, ...linked.summary }]
        : row.relationships,
    relationshipPaths:
      column.kind === "relationshipPath"
        ? [{ pathId: column.definition.id, ...linked.summary }]
        : row.relationshipPaths,
  } as RecordRow;
  const chip = linked.records.length ? (
    <RecordPropertyChipView entry={entry} presentation={store.presentation} record={linkedRow} />
  ) : (
    <PlaceholderChip column={column} store={store} />
  );
  if (!editable || column.kind !== "relationship") return chip;
  const relation = column.relation;
  const direction = column.direction;
  const singular = (direction === "outgoing" ? relation.sourceCardinality : relation.targetCardinality) === "one";
  const stage = (choice: RecordChoice, action: "link" | "unlink") =>
    store.stageLink({ action, relationId: relation.id, direction, record: choice.ref }, choice.title);
  const toggle = (choice: RecordChoice, isLinked: boolean) => {
    if (isLinked) stage(choice, "unlink");
    else {
      if (singular) for (const previous of linked.records) stage(previous, "unlink");
      stage(choice, "link");
    }
    setOpen(false);
  };
  const openRecord = (ref: RecordRef) => {
    setOpen(false);
    store.rootStore.recordWorkspaceStore.open(ref);
  };
  return (
    <ChipPopover wide chip={chip} label={column.label} open={open} onOpenChange={setOpen}>
      <RecordLinkPicker
        failed={linked.failed}
        label={column.label}
        linkLabels={store.presentation.linkLabels}
        linked={linked.loading ? null : linked.records}
        typeId={linkTypeId(column)}
        onOpenRecord={openRecord}
        onRetry={linked.retry}
        onToggle={toggle}
      />
    </ChipPopover>
  );
});

function editsInChip(store: RecordEditorStore, column: RecordChipColumn) {
  if (store.isReadOnly) return false;
  if (column.kind === "field") {
    return (
      isRecordFieldWritable(column.field) &&
      column.field.valueType !== "richText" &&
      column.field.valueType !== "file" &&
      !CLICK_ACTION_VALUE_TYPES.includes(column.field.valueType)
    );
  }
  if (column.kind === "relationship") {
    return !store.presentation.model.types.some(
      (type) => type.embedded && type.parentRelationshipId === column.relation.id,
    );
  }
  return false;
}

const AssigneeEditor = observer(function AssigneeEditor({ store, label }: { store: RecordEditorStore; label: string }) {
  const inputId = `assignedUserIds-chip-${useId()}`;
  const { setPreviewFieldValue } = useEntityDetailPersonalization();
  const preview = useCallback(
    (items: EntityDetailPreviewItem[]) => setPreviewFieldValue("system:assignedTo", items),
    [setPreviewFieldValue],
  );
  return (
    <FormAutocompleteAvatar
      ariaLabel={label}
      getItems={getActiveUsersAction}
      id="assignedUserIds"
      inputId={inputId}
      items={store.record?.assignedUsers ?? (store.rootStore.userStore.user ? [store.rootStore.userStore.user] : [])}
      label={null}
      selectionMode="multiple"
      onSelectionDataChange={preview}
    />
  );
});

const DetailChip = observer(function DetailChip({
  store,
  entry,
  row,
  personalizing,
}: {
  store: RecordEditorStore;
  entry: RecordChipEntry;
  row: RecordRow;
  personalizing: boolean;
}) {
  const inputId = `chip-${useId()}`;
  const [open, setOpen] = useState(false);
  const column = entry.column;
  const editable = !personalizing && !store.isReadOnly;
  if (column.kind === "relationship" || column.kind === "relationshipPath")
    return <LinkedChip editable={!personalizing && editsInChip(store, column)} entry={entry} row={row} store={store} />;

  if (column.kind === "field" && column.field.valueType === "channels") {
    if (!entry.empty) return <IdentityChips field={column.field} record={row} />;
    const placeholder = <PlaceholderChip column={column} store={store} />;
    if (!editable || store.isDisabled) return placeholder;
    return (
      <ChipPopover chip={placeholder} label={column.label} open={open} onOpenChange={setOpen}>
        <EditorHeading label={column.label} />

        <RecordChannelPopover editor={store} />
      </ChipPopover>
    );
  }
  if (column.id === "system:assignedTo") {
    if (!entry.empty) {
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
    const placeholder = <PlaceholderChip column={column} store={store} />;
    if (!editable) return placeholder;
    return (
      <ChipPopover chip={placeholder} label={column.label} open={open} onOpenChange={setOpen}>
        <EditorHeading label={column.label} />

        <AssigneeEditor label={column.label} store={store} />
      </ChipPopover>
    );
  }
  const chip = entry.empty ? (
    <PlaceholderChip column={column} store={store} />
  ) : (
    <RecordPropertyChipView entry={entry} presentation={store.presentation} record={row} />
  );
  if (personalizing || column.kind !== "field" || !editsInChip(store, column)) return chip;
  return (
    <ChipPopover chip={chip} label={column.label} open={open} onOpenChange={setOpen}>
      <EditorHeading label={column.label} />

      <RecordInputField
        field={column.field}
        id={`values.${column.field.id}`}
        inputId={inputId}
        label={null}
        members={row.memberUsers}
      />
    </ChipPopover>
  );
});

const PinChip = observer(function PinChip({
  store,
  columns,
  pinnedIds,
}: {
  store: RecordEditorStore;
  columns: RecordChipColumn[];
  pinnedIds: string[];
}) {
  const t = useTranslations();
  const { toggleStarredField } = useEntityDetailPersonalization();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={t("EntityDetail.pinMore")} className={CHIP_TRIGGER_CLASS} data-pin-chip="" type="button">
          <AddChip label={t("EntityDetail.pinMore")} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={pinnedIds.includes(column.id)}
            onCheckedChange={() => toggleStarredField(column.id)}
            onSelect={(event) => event.preventDefault()}
          >
            <ChipColumnIcon column={column} icons={store.presentation.linkIcons} />

            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export const RecordDetailChipRow = observer(function RecordDetailChipRow({
  store,
  className,
  joinsTopBar = false,
}: {
  store: RecordEditorStore;
  className?: string;
  joinsTopBar?: boolean;
}) {
  const t = useTranslations();
  const { starredFieldIds, isPersonalizing, previewFieldValues } = useEntityDetailPersonalization();
  const all = recordColumns(store.presentation.typeId, store.presentation.model)
    .filter((column) => store.record || column.kind !== "system" || column.id === "system:assignedTo")
    .map((column) =>
      column.kind === "system" ? { ...column, label: t(`RecordModel.${column.label}`) } : column,
    ) as RecordChipColumn[];
  const byId = new Map(all.map((column) => [column.id, column]));
  const pinned = starredFieldIds.flatMap((id) => byId.get(id) ?? []);
  const row = draftRow(store, previewFieldValues["system:assignedTo"]);
  const { entries } = recordChipRowModel(pinned, row, { keepEmpty: true });
  const canPin = !isPersonalizing && !store.trash && all.length > 0;
  if (!entries.length && !canPin) return null;
  return (
    <div
      className={cn(
        joinsTopBar &&
          "shrink-0 border-b border-border bg-background px-4 ps-[calc(1rem+var(--safe-left,0px))] pe-[calc(1rem+var(--safe-right,0px))] pb-3",
        className,
      )}
      data-joins-top-bar={joinsTopBar ? "" : undefined}
      data-record-chip-row=""
    >
      <RecordChipList
        entries={entries}
        renderChip={(entry) => <DetailChip entry={entry} personalizing={isPersonalizing} row={row} store={store} />}
      >
        {canPin && <PinChip columns={all} pinnedIds={starredFieldIds} store={store} />}
      </RecordChipList>
    </div>
  );
});
