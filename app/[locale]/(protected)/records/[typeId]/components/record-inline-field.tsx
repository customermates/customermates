"use client";

import type { ReactNode } from "react";
import type { RecordFieldView, RecordRelationship, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordsStore } from "./records.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, Lock, Pencil } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { toChipColor } from "@/constants/chip-colors";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { isRecordFieldWritable, recordDraftValue } from "@/features/records/record-input-value";
import { RecordFieldValueEditor, RecordFieldValueStore } from "./record-field-value-editor";
import { useRecordChoices } from "./record-relationship-editor";

const INLINE_HINT_CLASS =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 group-hover/row:opacity-100 group-hover/card:opacity-100 data-[state=open]:opacity-100 any-pointer-coarse:opacity-100";
const INLINE_AFFORDANCE_CLASS = `${INLINE_HINT_CLASS} hover:bg-accent hover:text-accent-foreground`;

export function canEditInline(store: RecordsStore, record: RecordRow, field: RecordFieldView) {
  if (!store.canUpdateRecord(record) || !isRecordFieldWritable(field)) return false;
  if (field.id === store.type?.primaryFieldId || field.valueType === "richText") return false;
  const result = record.fields.find((value) => value.fieldId === field.id)?.result;
  return result?.state !== "restricted" && result?.state !== "error";
}

export function isCalculatedForEditor(store: RecordsStore, record: RecordRow, field: RecordFieldView) {
  return store.canUpdateRecord(record) && !isRecordFieldWritable(field) && field.id !== store.type?.primaryFieldId;
}

function latestRow(records: RecordsStore, record: RecordRow) {
  return records.items.find((item) => item.id === record.id) ?? record;
}

export function hasInlineRelationshipEditor(records: RecordsStore, record: RecordRow, relation: RecordRelationship) {
  return (
    records.canUpdateRecord(record) &&
    !records.presentation.model.types.some((type) => type.embedded && type.parentRelationshipId === relation.id)
  );
}

function useInlineSave(records: RecordsStore, record: RecordRow, field: RecordFieldView) {
  const [busy, setBusy] = useState(false);
  const save = (value: RecordScalar | null) =>
    runUserAction(async () => {
      setBusy(true);
      try {
        const outcome = await records.updateRecordField(latestRow(records, record), field.id, value);
        if (outcome.invalid?.length) toastZodErrorTree({ errors: outcome.invalid });
      } finally {
        setBusy(false);
      }
    });
  return { busy, save };
}

const InlineFieldForm = observer(function InlineFieldForm({
  records,
  record,
  field,
  onDone,
}: {
  records: RecordsStore;
  record: RecordRow;
  field: RecordFieldView;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [store] = useState(() => {
    const result = record.fields.find((value) => value.fieldId === field.id)?.result;
    return new RecordFieldValueStore(
      records.rootStore,
      field,
      recordDraftValue(result?.state === "value" ? result.value : null),
      (value) => records.updateRecordField(latestRow(records, record), field.id, value),
      onDone,
    );
  });
  return <RecordFieldValueEditor saveOnDatePick store={store} submitLabel={t("Common.actions.save")} />;
});

const InlineSelect = observer(function InlineSelect({
  records,
  record,
  field,
  children,
}: {
  records: RecordsStore;
  record: RecordRow;
  field: RecordFieldView;
  children: ReactNode;
}) {
  const t = useTranslations();
  const { busy, save } = useInlineSave(records, record, field);
  const result = record.fields.find((value) => value.fieldId === field.id)?.result;
  const current = result?.state === "value" && result.value.kind === "select" ? result.value.value : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <button
          aria-label={t("RecordModel.editValue", { field: field.label })}
          className="inline-flex max-w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
          data-inline-edit={field.id}
          type="button"
        >
          {current === null ? (
            <span className="rounded-md px-1 text-muted-foreground hover:bg-accent">—</span>
          ) : (
            <span className="inline-flex max-w-full cursor-pointer [&_[data-slot=badge]]:hover:brightness-95">
              {children}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
        {field.options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            data-selected={option.id === current || undefined}
            onSelect={() => {
              if (option.id !== current) save({ kind: "select", value: option.id });
            }}
          >
            <AppChip variant={toChipColor(option.color)}>{option.label}</AppChip>
          </DropdownMenuItem>
        ))}

        {!field.required && current !== null && (
          <>
            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => save(null)}>{t("Common.actions.clear")}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const InlineBoolean = observer(function InlineBoolean({
  records,
  record,
  field,
}: {
  records: RecordsStore;
  record: RecordRow;
  field: RecordFieldView;
}) {
  const t = useTranslations();
  const { busy, save } = useInlineSave(records, record, field);
  const result = record.fields.find((value) => value.fieldId === field.id)?.result;
  const checked = result?.state === "value" && result.value.kind === "boolean" && result.value.value;
  return (
    <Switch
      aria-label={t("RecordModel.editValue", { field: field.label })}
      checked={checked}
      data-inline-edit={field.id}
      disabled={busy}
      size="sm"
      onCheckedChange={(next) => save({ kind: "boolean", value: next })}
    />
  );
});

export const RecordInlineField = observer(function RecordInlineField({
  records,
  record,
  field,
  children,
}: {
  records: RecordsStore;
  record: RecordRow;
  field: RecordFieldView;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  if (field.valueType === "select") {
    return (
      <InlineSelect field={field} record={record} records={records}>
        {children}
      </InlineSelect>
    );
  }
  if (field.valueType === "boolean") return <InlineBoolean field={field} record={record} records={records} />;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{children}</span>

      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("RecordModel.editValue", { field: field.label })}
            className={INLINE_AFFORDANCE_CLASS}
            data-inline-edit={field.id}
            type="button"
          >
            <Pencil aria-hidden className="size-3.5" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80 p-3">
          {open && <InlineFieldForm field={field} record={record} records={records} onDone={() => setOpen(false)} />}
        </PopoverContent>
      </Popover>
    </span>
  );
});

export function RecordCalculatedCell({ field, children }: { field: RecordFieldView; children: ReactNode }) {
  const t = useTranslations();
  const label = t("RecordModel.calculatedReadOnly", { field: field.label });
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{children}</span>

      <Tooltip>
        <TooltipTrigger asChild>
          <span aria-hidden className={INLINE_HINT_CLASS} data-read-only-field={field.id}>
            <Lock aria-hidden className="size-3.5" />
          </span>
        </TooltipTrigger>

        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function choiceTitle(record: RecordChoice, t: ReturnType<typeof useTranslations>) {
  return record.title.state === "restricted"
    ? t("RecordModel.restricted")
    : record.title.state === "error"
      ? t("RecordModel.calculationError")
      : record.title.state === "value" && record.title.value.kind === "text"
        ? record.title.value.value
        : t("RecordModel.record");
}

const InlineRelationshipPicker = observer(function InlineRelationshipPicker({
  records,
  record,
  relation,
  direction,
  label,
  onDone,
}: {
  records: RecordsStore;
  record: RecordRow;
  relation: RecordRelationship;
  direction: "outgoing" | "incoming";
  label: string;
  onDone: () => void;
}) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const debounced = useDebouncedValue(search);
  const typeId = direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
  const singular = (direction === "outgoing" ? relation.sourceCardinality : relation.targetCardinality) === "one";
  const linked = useRecordChoices(
    { typeId, page: 1, pageSize: 100, linkedTo: { ref: record.ref, relationId: relation.id, direction } },
    true,
    attempt,
  );
  const options = useRecordChoices({ typeId, page: 1, pageSize: 25, search: debounced }, true, attempt);
  const linkedIds = new Set(linked.data?.records.map((entry) => entry.ref.recordId) ?? []);
  const toggle = (choice: RecordChoice) =>
    runUserAction(async () => {
      if (busy) return;
      const isLinked = linkedIds.has(choice.ref.recordId);
      const changes = isLinked
        ? [{ action: "unlink" as const, relationId: relation.id, direction, record: choice.ref }]
        : [
            ...(singular
              ? (linked.data?.records ?? []).map((entry) => ({
                  action: "unlink" as const,
                  relationId: relation.id,
                  direction,
                  record: entry.ref,
                }))
              : []),
            { action: "link" as const, relationId: relation.id, direction, record: choice.ref },
          ];
      setBusy(true);
      try {
        const outcome = await records.updateRecordLinks(latestRow(records, record), changes);
        if (outcome.saved) onDone();
        else if (outcome.invalid?.length) toastZodErrorTree({ errors: outcome.invalid });
      } finally {
        setBusy(false);
      }
    });
  return (
    <Command shouldFilter={false}>
      <CommandInput aria-label={label} value={search} onValueChange={setSearch} />

      <CommandList>
        {options.loading || linked.loading ? (
          <SelectionOptionsSkeleton label={t("Loading.text")} />
        ) : options.failed || linked.failed ? (
          <div className="flex items-center gap-2 p-3 text-sm" role="alert">
            <span>{t("Common.notifications.unexpectedError")}</span>

            <Button size="sm" type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              {t("ErrorCard.retry")}
            </Button>
          </div>
        ) : (
          <>
            <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

            <CommandGroup>
              {(options.data?.records ?? []).map((choice) => {
                const isLinked = linkedIds.has(choice.ref.recordId);
                return (
                  <CommandItem
                    key={choice.ref.recordId}
                    aria-selected={isLinked}
                    disabled={busy}
                    value={choice.ref.recordId}
                    onSelect={() => toggle(choice)}
                  >
                    <span className="flex-1 truncate">{choiceTitle(choice, t)}</span>

                    {isLinked && <Check aria-hidden className="size-4" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
});

export const RecordInlineRelationship = observer(function RecordInlineRelationship({
  records,
  record,
  relation,
  direction,
  label,
  children,
}: {
  records: RecordsStore;
  record: RecordRow;
  relation: RecordRelationship;
  direction: "outgoing" | "incoming";
  label: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0">{children}</span>

      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("RecordModel.editValue", { field: label })}
            className={INLINE_AFFORDANCE_CLASS}
            data-inline-edit={relation.id}
            type="button"
          >
            <Pencil aria-hidden className="size-3.5" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-0">
          {open && (
            <InlineRelationshipPicker
              direction={direction}
              label={label}
              record={record}
              records={records}
              relation={relation}
              onDone={() => setOpen(false)}
            />
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
});
