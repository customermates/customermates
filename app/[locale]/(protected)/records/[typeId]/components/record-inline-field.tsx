"use client";

import type { ReactNode } from "react";
import type { RecordFieldView, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "./records.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toChipColor } from "@/constants/chip-colors";
import { runUserAction } from "@/core/errors/report-application-error";
import { isRecordFieldWritable, recordDraftValue } from "@/features/records/record-input-value";
import { RecordFieldValueEditor, RecordFieldValueStore } from "./record-field-value-editor";

export function canEditInline(store: RecordsStore, record: RecordRow, field: RecordFieldView) {
  if (!store.canUpdateRecord(record) || !isRecordFieldWritable(field)) return false;
  if (field.id === store.type?.primaryFieldId || field.valueType === "richText") return false;
  const result = record.fields.find((value) => value.fieldId === field.id)?.result;
  return result?.state !== "restricted" && result?.state !== "error";
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
      (value) => records.updateRecordField(record, field.id, value),
      onDone,
    );
  });
  return <RecordFieldValueEditor store={store} submitLabel={t("Common.actions.save")} />;
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
  const [busy, setBusy] = useState(false);
  const result = record.fields.find((value) => value.fieldId === field.id)?.result;
  const current = result?.state === "value" && result.value.kind === "select" ? result.value.value : null;
  const choose = (value: RecordScalar | null) =>
    runUserAction(async () => {
      setBusy(true);
      try {
        await records.updateRecordField(record, field.id, value);
      } finally {
        setBusy(false);
      }
    });
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
              if (option.id !== current) choose({ kind: "select", value: option.id });
            }}
          >
            <AppChip variant={toChipColor(option.color)}>{option.label}</AppChip>
          </DropdownMenuItem>
        ))}

        {!field.required && current !== null && (
          <>
            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => choose(null)}>{t("Common.actions.clear")}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <span className="group/inline-edit flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{children}</span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label={t("RecordModel.editValue", { field: field.label })}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 group-hover/row:opacity-100 data-[state=open]:opacity-100 any-pointer-coarse:opacity-100"
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
