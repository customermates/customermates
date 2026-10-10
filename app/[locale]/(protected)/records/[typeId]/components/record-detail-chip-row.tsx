"use client";

import type { ReactNode } from "react";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";

import { useCallback, useId, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { PinOff, Plus } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { runUserAction } from "@/core/errors/report-application-error";
import {
  type EntityDetailPreviewItem,
  useEntityDetailPersonalization,
} from "@/components/entity-detail/entity-detail-personalization";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { RecordValueTypeIcon } from "@/components/records/record-value-type-icon";
import { ContactValue } from "@/components/records/contact-value";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isEmailProvider, isPhoneProvider } from "@/ee/messaging/provider";
import { getChannelIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel } from "@/ee/messaging/thread-display";
import { recordColumns } from "@/features/records/record-columns";
import { isRecordFieldWritable } from "@/features/records/record-input-value";
import { CONTACT_VALUE_TYPES } from "@/features/records/record-model-validation";
import { getUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { type RecordChipColumn, type RecordChipEntry, recordChipRowModel } from "./record-chip-row-model";
import { RecordPropertyChipView } from "./record-chip-row";
import { RecordChannelPopover } from "./record-identity-editor";
import { focusFirstControl, RecordLinkPicker } from "./record-inline-field";
import { RecordInputField } from "./record-input-field";
import { useRecordChoices } from "./record-relationship-editor";

const CHIP_TRIGGER_CLASS =
  "inline-flex max-w-full min-w-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

type LinkColumn = Extract<RecordChipColumn, { kind: "relationship" | "relationshipPath" }>;

function linkTypeId(column: LinkColumn) {
  if (column.kind === "relationshipPath") return column.targetTypeId;
  return column.direction === "outgoing" ? column.relation.targetTypeId : column.relation.sourceTypeId;
}

function columnIcon(store: RecordEditorStore, column: RecordChipColumn) {
  if (column.kind === "field") return <RecordValueTypeIcon valueType={column.field.valueType} />;
  if (column.kind === "relationship" || column.kind === "relationshipPath")
    return <RecordChipIcon icons={store.presentation.linkIcons} typeId={linkTypeId(column)} />;
  return <RecordValueTypeIcon valueType={column.kind === "system" ? "dateTime" : "text"} />;
}

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
    store.record !== null && store.isOpen,
    (store.record?.version ?? 0) + attempt,
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
    <AppChip className="text-muted-foreground" data-placeholder-chip="" startContent={columnIcon(store, column)}>
      {column.label}
    </AppChip>
  );
}

function UnpinItem({ label, onUnpin }: { label: string; onUnpin: () => void }) {
  const t = useTranslations();
  return (
    <CommandGroup className="border-t border-border">
      <CommandItem value="unpin" onSelect={onUnpin}>
        <PinOff aria-hidden className="size-4" />

        <span className="flex-1 truncate">{t("EntityDetail.unpinField", { field: label })}</span>
      </CommandItem>
    </CommandGroup>
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

      <PopoverContent
        align="start"
        className={wide ? "w-72 p-0" : "w-80 space-y-2 p-3"}
        onOpenAutoFocus={focusFirstControl}
      >
        {open && children}
      </PopoverContent>
    </Popover>
  );
}

function EditorHeading({ label, onUnpin }: { label: string; onUnpin: () => void }) {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>

      <IconButton fieldAction icon={PinOff} label={t("EntityDetail.unpinField", { field: label })} onClick={onUnpin} />
    </div>
  );
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
  const { toggleStarredField } = useEntityDetailPersonalization();
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
      >
        <UnpinItem
          label={column.label}
          onUnpin={() => {
            setOpen(false);
            toggleStarredField(column.id);
          }}
        />
      </RecordLinkPicker>
    </ChipPopover>
  );
});

function IdentityChips({ row }: { row: RecordRow }) {
  return (
    <>
      {(row.identities ?? []).map((identity) => {
        const Icon = getChannelIcon(identity.provider);
        const label =
          channelDisplayLabel(identity.provider, identity.value, identity.profileUrl) ||
          identity.displayName ||
          identity.value;
        const kind = isEmailProvider(identity.provider) ? "email" : isPhoneProvider(identity.provider) ? "phone" : null;
        return (
          <AppChip key={identity.id} startContent={<Icon className="size-3" />}>
            {kind ? <ContactValue kind={kind} label={label} value={identity.value} /> : label}
          </AppChip>
        );
      })}
    </>
  );
}

function editsInChip(store: RecordEditorStore, column: RecordChipColumn) {
  if (store.isReadOnly) return false;
  if (column.kind === "field") {
    return (
      isRecordFieldWritable(column.field) &&
      column.field.valueType !== "richText" &&
      !CONTACT_VALUE_TYPES.includes(column.field.valueType)
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
      getItems={getUsersAction}
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
  const { toggleStarredField } = useEntityDetailPersonalization();
  const inputId = `chip-${useId()}`;
  const [open, setOpen] = useState(false);
  const column = entry.column;
  const editable = !personalizing && !store.isReadOnly;
  const unpin = () => {
    setOpen(false);
    toggleStarredField(column.id);
  };
  if (column.kind === "relationship" || column.kind === "relationshipPath")
    return <LinkedChip editable={!personalizing && editsInChip(store, column)} entry={entry} row={row} store={store} />;

  if (column.kind === "identity") {
    if (!entry.empty) return <IdentityChips row={row} />;
    const placeholder = <PlaceholderChip column={column} store={store} />;
    if (!editable || store.isDisabled) return placeholder;
    return (
      <ChipPopover chip={placeholder} label={column.label} open={open} onOpenChange={setOpen}>
        <EditorHeading label={column.label} onUnpin={unpin} />

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
        <EditorHeading label={column.label} onUnpin={unpin} />

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
      <EditorHeading label={column.label} onUnpin={unpin} />

      <RecordInputField field={column.field} id={`values.${column.field.id}`} inputId={inputId} label={null} />
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
          <AppChip
            interactive
            className="border-dashed border-border bg-transparent text-muted-foreground"
            tooltip={t("EntityDetail.pinMore")}
          >
            <Plus aria-hidden className="size-3" />
          </AppChip>
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
            {columnIcon(store, column)}

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
}: {
  store: RecordEditorStore;
  className?: string;
}) {
  const t = useTranslations();
  const { starredFieldIds, isPersonalizing, previewFieldValues } = useEntityDetailPersonalization();
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
  const row = draftRow(store, previewFieldValues["system:assignedTo"]);
  const { entries } = recordChipRowModel(pinned, row, { keepEmpty: true });
  const canPin = !isPersonalizing && !store.isReadOnly && all.length > 0;
  if (!entries.length && !canPin) return null;
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
            <DetailChip entry={entry} personalizing={isPersonalizing} row={row} store={store} />
          </span>
        ))}

        {canPin && <PinChip columns={all} pinnedIds={starredFieldIds} store={store} />}
      </div>
    </div>
  );
});
