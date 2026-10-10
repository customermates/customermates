"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import type {
  CalculationExpression,
  RecordFieldView,
  RecordModelView,
  RecordRef,
  RecordRelationship,
  RecordScalar,
} from "@/features/records/record-model.schema";
import type { RecordLinkLabels, RecordRow } from "@/features/records/record-presentation";
import type { RecordColumn } from "@/features/records/record-columns";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordsStore } from "./records.store";

import { useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, Plus, UserRound } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { EmptyValue } from "@/components/shared/empty-value";
import { Avatar } from "@/components/ui/avatar";
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
import { AppForm } from "@/components/forms/form-context";
import { SelectionOptionsSkeleton } from "@/components/forms/selection-loading";
import { toChipColor } from "@/constants/chip-colors";
import { isInteractiveClick } from "@/components/data-view/is-interactive-click";
import { useDataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import { recordTitle } from "@/components/records/record-title";
import { cn } from "@/core/utils/cn";
import { CONTACT_VALUE_TYPES } from "@/features/records/record-model-validation";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { isRecordFieldWritable, recordDraftValue } from "@/features/records/record-input-value";
import { expressionSegments, sentenceText } from "@/features/records/calculation-sentence";
import { RecordFieldValueEditor, RecordFieldValueStore } from "./record-field-value-editor";
import { RecordInputField } from "./record-input-field";
import { useRecordChoices } from "./record-relationship-editor";
import { isEmptyResult } from "./record-chip-row-model";

const EDIT_TARGET_SELECTOR = "[data-edit-target]";
const EDIT_TARGET_CLASS =
  "group/edit inline-flex min-h-6 max-w-full min-w-0 cursor-pointer items-center rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-default";
const EDIT_SPACE_BUTTON_CLASS =
  "sr-only focus-visible:not-sr-only focus-visible:ml-1 focus-visible:rounded-md focus-visible:px-1 focus-visible:text-xs focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none";
const IN_PLACE_VALUE_TYPES: RecordFieldView["valueType"][] = ["text", "number", "currency", ...CONTACT_VALUE_TYPES];

export function focusFirstControl(event: Event) {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  event.currentTarget
    .querySelector<HTMLElement>('input:not([type="hidden"]):not([aria-hidden="true"]), textarea, [role="combobox"]')
    ?.focus({ preventScroll: true });
}

export function canEditInline(store: RecordsStore, record: RecordRow, field: RecordFieldView) {
  if (!store.canUpdateRecord(record) || !isRecordFieldWritable(field)) return false;
  if (field.id === store.type?.primaryFieldId || field.valueType === "richText") return false;
  const result = record.fields.find((value) => value.fieldId === field.id)?.result;
  return result?.state !== "restricted" && result?.state !== "error";
}

export function isCalculatedField(store: RecordsStore, field: RecordFieldView) {
  return !isRecordFieldWritable(field) && field.id !== store.type?.primaryFieldId;
}

export function hasInlineRelationshipEditor(records: RecordsStore, record: RecordRow, relation: RecordRelationship) {
  return (
    records.canUpdateRecord(record) &&
    !records.presentation.model.types.some((type) => type.embedded && type.parentRelationshipId === relation.id)
  );
}

export function editsInPlace(field: RecordFieldView) {
  return !field.multiple && IN_PLACE_VALUE_TYPES.includes(field.valueType);
}

function latestRow(records: RecordsStore, record: RecordRow) {
  return records.items.find((item) => item.id === record.id) ?? record;
}

function fieldResult(record: RecordRow, field: RecordFieldView) {
  return record.fields.find((value) => value.fieldId === field.id)?.result;
}

function nextEditTarget(from: HTMLElement | null, backwards: boolean) {
  const scope = from?.closest<HTMLElement>("[data-slot='table'], [data-slot='kanban-root']");
  if (!from || !scope) return null;
  const targets = [...scope.querySelectorAll<HTMLElement>(EDIT_TARGET_SELECTOR)].filter(
    (target) => !from.contains(target),
  );
  const candidates = targets.filter((target) =>
    Boolean(
      from.compareDocumentPosition(target) &
        (backwards ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING),
    ),
  );
  const next = backwards ? candidates.at(-1) : candidates[0];
  const container = next?.closest<HTMLElement>("[data-row-id], [data-item-id]");
  const id = next?.getAttribute("data-inline-edit");
  const rowId = container?.getAttribute("data-row-id") ?? container?.getAttribute("data-item-id");
  if (!id || !rowId) return null;
  const selector = `:is([data-row-id="${CSS.escape(rowId)}"], [data-item-id="${CSS.escape(rowId)}"]) [data-inline-edit="${CSS.escape(id)}"]`;
  return () => {
    const target = scope.querySelector<HTMLElement>(selector);
    if (!target) return;
    if (target.hasAttribute("data-edit-in-place")) target.click();
    else target.focus();
  };
}

export function EmptyValueTarget({ member = false }: { member?: boolean }) {
  return (
    <span
      className="inline-flex items-center text-muted-foreground/60 opacity-0 transition-opacity group-hover/row:opacity-100 group-hover/card:opacity-100 group-focus-visible/edit:opacity-100 group-data-[state=open]/edit:opacity-100 any-pointer-coarse:opacity-100"
      data-empty-target=""
    >
      <EmptyValue />

      {member ? (
        <Avatar aria-hidden unlinked fallback={<UserRound className="size-3" />} size="sm" />
      ) : (
        <Plus aria-hidden className="size-3.5" />
      )}
    </span>
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

function useFieldValueStore(records: RecordsStore, record: RecordRow, field: RecordFieldView, onDone: () => void) {
  const [store] = useState(() => {
    const result = fieldResult(record, field);
    return new RecordFieldValueStore(
      records.rootStore,
      field,
      recordDraftValue(result?.state === "value" ? result.value : null),
      (value) => records.updateRecordField(latestRow(records, record), field.id, value),
      onDone,
    );
  });
  return store;
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
  const store = useFieldValueStore(records, record, field, onDone);
  return <RecordFieldValueEditor saveOnDatePick store={store} onCancel={onDone} />;
});

const InPlaceFieldInput = observer(function InPlaceFieldInput({
  records,
  record,
  field,
  onDone,
}: {
  records: RecordsStore;
  record: RecordRow;
  field: RecordFieldView;
  onDone: (activateNext?: () => void) => void;
}) {
  const inputId = useId();
  const container = useRef<HTMLDivElement>(null);
  const activateNext = useRef<(() => void) | undefined>(undefined);
  const store = useFieldValueStore(records, record, field, () => onDone(activateNext.current));
  useEffect(() => {
    container.current?.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus({ preventScroll: true });
  }, []);
  const commit = (next?: () => void) =>
    runUserAction(async () => {
      activateNext.current = next;
      if (!store.hasUnsavedChanges) {
        onDone(next);
        return;
      }
      await store.apply(false);
    });
  return (
    <div
      ref={container}
      className="min-w-0 flex-1 [&_input]:h-7 [&_input]:px-2 [&_input]:text-[13px]"
      data-in-place-editor={field.id}
      role="presentation"
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        if (!store.isLoading) commit();
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDone();
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit();
        } else if (event.key === "Tab") {
          event.preventDefault();
          commit(nextEditTarget(container.current, event.shiftKey) ?? undefined);
        }
      }}
    >
      <AppForm store={store}>
        <label className="sr-only" htmlFor={inputId}>
          {field.label}
        </label>

        <RecordInputField field={field} id="value" inputId={inputId} label={null} />
      </AppForm>
    </div>
  );
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
  const result = fieldResult(record, field);
  const current = result?.state === "value" && result.value.kind === "select" ? result.value.value : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={busy}>
        <button
          aria-label={t("RecordModel.editValue", { field: field.label })}
          className={cn(EDIT_TARGET_CLASS, "[&_[data-slot=badge]]:hover:brightness-95")}
          data-edit-target=""
          data-inline-edit={field.id}
          type="button"
        >
          {current === null ? <EmptyValueTarget /> : children}
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
  const result = fieldResult(record, field);
  const checked = result?.state === "value" && result.value.kind === "boolean" && result.value.value;
  return (
    <Switch
      aria-label={t("RecordModel.editValue", { field: field.label })}
      checked={checked}
      data-edit-target=""
      data-inline-edit={field.id}
      disabled={busy}
      size="sm"
      onCheckedChange={(next) => save({ kind: "boolean", value: next })}
    />
  );
});

const InPlaceField = observer(function InPlaceField({
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
  const [editing, setEditing] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const restoreFocus = useRef(false);
  const empty = isEmptyResult(fieldResult(record, field));
  const contact = CONTACT_VALUE_TYPES.includes(field.valueType);
  const label = t("RecordModel.editValue", { field: field.label });
  useEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    anchor.current?.querySelector<HTMLElement>(EDIT_TARGET_SELECTOR)?.focus({ preventScroll: true });
  }, [editing]);
  if (editing) {
    return (
      <span ref={anchor} className="flex min-w-0 flex-1">
        <InPlaceFieldInput
          field={field}
          record={record}
          records={records}
          onDone={(activateNext) => {
            const focus = document.activeElement;
            restoreFocus.current =
              !activateNext && (focus === document.body || Boolean(focus && anchor.current?.contains(focus)));
            setEditing(false);
            if (activateNext) requestAnimationFrame(activateNext);
          }}
        />
      </span>
    );
  }
  if (contact && !empty) {
    return (
      <span
        ref={anchor}
        className="-mx-3 -my-2 flex min-w-0 cursor-text items-center px-3 py-2"
        data-inline-edit-space={field.id}
        role="presentation"
        onClick={(event: MouseEvent<HTMLSpanElement>) => {
          if (records.selectedIds.size > 0 || isInteractiveClick(event)) return;
          event.stopPropagation();
          setEditing(true);
        }}
      >
        <span className="min-w-0 truncate">{children}</span>

        <button
          aria-label={label}
          className={EDIT_SPACE_BUTTON_CLASS}
          data-edit-in-place=""
          data-edit-target=""
          data-inline-edit={field.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          {t("RecordModel.edit")}
        </button>
      </span>
    );
  }
  return (
    <span ref={anchor} className="flex w-full min-w-0">
      <button
        aria-label={label}
        className={cn(EDIT_TARGET_CLASS, "w-full")}
        data-edit-in-place=""
        data-edit-target=""
        data-inline-edit={field.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        {empty ? <EmptyValueTarget /> : <span className="min-w-0 truncate">{children}</span>}
      </button>
    </span>
  );
});

const PopoverField = observer(function PopoverField({
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
  const empty = isEmptyResult(fieldResult(record, field));
  const contact = CONTACT_VALUE_TYPES.includes(field.valueType) && !empty;
  const label = t("RecordModel.editValue", { field: field.label });
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      {contact ? (
        <span className="flex min-w-0 items-center">
          <span className="min-w-0 truncate">{children}</span>

          <PopoverTrigger asChild>
            <button
              aria-label={label}
              className={EDIT_SPACE_BUTTON_CLASS}
              data-edit-target=""
              data-inline-edit={field.id}
              type="button"
              onClick={(event) => event.stopPropagation()}
            >
              {t("RecordModel.edit")}
            </button>
          </PopoverTrigger>
        </span>
      ) : (
        <PopoverTrigger asChild>
          <button
            aria-label={label}
            className={EDIT_TARGET_CLASS}
            data-edit-target=""
            data-inline-edit={field.id}
            type="button"
            onClick={(event) => event.stopPropagation()}
          >
            {empty ? <EmptyValueTarget member={field.valueType === "member"} /> : children}
          </button>
        </PopoverTrigger>
      )}

      <PopoverContent align="start" className="w-80 space-y-2 p-3" onOpenAutoFocus={focusFirstControl}>
        <p className="text-xs font-medium text-muted-foreground">{field.label}</p>

        {open && <InlineFieldForm field={field} record={record} records={records} onDone={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
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
  const layout = useDataViewItemLayout();
  if (field.valueType === "select" && !field.multiple) {
    return (
      <InlineSelect field={field} record={record} records={records}>
        {children}
      </InlineSelect>
    );
  }
  if (field.valueType === "boolean") return <InlineBoolean field={field} record={record} records={records} />;
  if (layout === "row" && editsInPlace(field)) {
    return (
      <InPlaceField field={field} record={record} records={records}>
        {children}
      </InPlaceField>
    );
  }
  return (
    <PopoverField field={field} record={record} records={records}>
      {children}
    </PopoverField>
  );
});

function expressionResolves(expression: CalculationExpression, model: RecordModelView): boolean {
  if (expression.kind === "field" || expression.kind === "optionAttribute")
    return model.fields.some((field) => field.id === expression.fieldId);
  if (expression.kind === "literal") return true;
  if (expression.kind === "related") {
    if (!model.relationships.some((relation) => relation.id === expression.relationId)) return false;
    return expression.reducer === "count" || expressionResolves(expression.expression, model);
  }
  return expression.arguments.every((argument) => expressionResolves(argument, model));
}

export function calculatedFieldLabel(
  field: RecordFieldView,
  model: RecordModelView,
  t: ReturnType<typeof useTranslations>,
) {
  const expression = field.behavior.kind === "input" ? undefined : field.behavior.expression;
  return expression && expressionResolves(expression, model)
    ? t("RecordModel.calculatedValue", {
        formula: sentenceText(
          expressionSegments(expression, field.typeId, {
            model,
            t: (key: string, values?: Record<string, string>) => t(key, values),
            operatorLabel: (operator) => t(`RecordModel.operators.${operator}`),
          }),
        ),
      })
    : t("RecordModel.calculatedValuePlain");
}

export function RecordCalculatedValue({
  field,
  model,
  children,
}: {
  field: RecordFieldView;
  model: RecordModelView;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex min-w-0 max-w-full truncate" data-calculated-field={field.id}>
          {children}
        </span>
      </TooltipTrigger>

      <TooltipContent>{calculatedFieldLabel(field, model, t)}</TooltipContent>
    </Tooltip>
  );
}

export const RecordLinkPicker = observer(function RecordLinkPicker({
  typeId,
  label,
  linkLabels,
  linked,
  failed,
  busy = false,
  onRetry,
  onToggle,
  onOpenRecord,
  children,
}: {
  typeId: string;
  label: string;
  linkLabels: RecordLinkLabels;
  linked: RecordChoice[] | null;
  failed: boolean;
  busy?: boolean;
  onRetry: () => void;
  onToggle: (choice: RecordChoice, isLinked: boolean) => void;
  onOpenRecord: (ref: RecordRef) => void;
  children?: ReactNode;
}) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState(0);
  const debounced = useDebouncedValue(search);
  const options = useRecordChoices({ typeId, page: 1, pageSize: 25, search: debounced }, true, attempt);
  const linkedIds = new Set((linked ?? []).map((entry) => entry.ref.recordId));
  return (
    <Command shouldFilter={false}>
      <CommandInput aria-label={label} value={search} onValueChange={setSearch} />

      <CommandList>
        {options.loading || linked === null ? (
          <SelectionOptionsSkeleton label={t("Loading.text")} />
        ) : options.failed || failed ? (
          <div className="flex items-center gap-2 p-3 text-sm" role="alert">
            <span>{t("Common.notifications.unexpectedError")}</span>

            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                setAttempt((value) => value + 1);
                onRetry();
              }}
            >
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
                    onSelect={() => onToggle(choice, isLinked)}
                  >
                    <span className="flex-1 truncate">
                      {recordTitle(choice.title, linkLabels[choice.ref.typeId], t)}
                    </span>

                    {isLinked && <Check aria-hidden className="size-4" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {linked.length > 0 && (
              <CommandGroup className="border-t border-border" data-slot="open-linked-records">
                {linked.map((choice) => (
                  <CommandItem
                    key={`open:${choice.ref.recordId}`}
                    value={`open:${choice.ref.recordId}`}
                    onSelect={() => onOpenRecord(choice.ref)}
                  >
                    <span className="flex-1 truncate">
                      {t("RecordModel.openRecord", {
                        name: recordTitle(choice.title, linkLabels[choice.ref.typeId], t),
                      })}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {children}
          </>
        )}
      </CommandList>
    </Command>
  );
});

const InlineRelationshipPicker = observer(function InlineRelationshipPicker({
  records,
  record,
  relation,
  direction,
  label,
  onDone,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  relation: RecordRelationship;
  direction: "outgoing" | "incoming";
  label: string;
  onDone: () => void;
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const typeId = direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
  const singular = (direction === "outgoing" ? relation.sourceCardinality : relation.targetCardinality) === "one";
  const linked = useRecordChoices(
    { typeId, page: 1, pageSize: 100, linkedTo: { ref: record.ref, relationId: relation.id, direction } },
    true,
    attempt,
  );
  const linkedRecords = linked.data?.records ?? [];
  const toggle = (choice: RecordChoice, isLinked: boolean) =>
    runUserAction(async () => {
      if (busy) return;
      const changes = isLinked
        ? [{ action: "unlink" as const, relationId: relation.id, direction, record: choice.ref }]
        : [
            ...(singular
              ? linkedRecords.map((entry) => ({
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
    <RecordLinkPicker
      busy={busy}
      failed={linked.failed}
      label={label}
      linkLabels={records.presentation.linkLabels}
      linked={linked.loading ? null : linkedRecords}
      typeId={typeId}
      onOpenRecord={(ref) => {
        onDone();
        onOpenRecord(ref);
      }}
      onRetry={() => setAttempt((value) => value + 1)}
      onToggle={toggle}
    />
  );
});

export const RecordInlineRelationship = observer(function RecordInlineRelationship({
  records,
  record,
  relation,
  direction,
  label,
  empty,
  onOpenRecord,
  children,
}: {
  records: RecordsStore;
  record: RecordRow;
  relation: RecordRelationship;
  direction: "outgoing" | "incoming";
  label: string;
  empty: boolean;
  onOpenRecord: (ref: RecordRef) => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("RecordModel.editValue", { field: label })}
          className={EDIT_TARGET_CLASS}
          data-edit-target=""
          data-inline-edit={relation.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (!(event.metaKey || event.ctrlKey)) return;
            const chipId = (event.target as HTMLElement).closest("[data-chip-id]")?.getAttribute("data-chip-id");
            const separator = chipId?.indexOf(":") ?? -1;
            if (!chipId || separator < 0) return;
            event.preventDefault();
            onOpenRecord({ typeId: chipId.slice(0, separator), recordId: chipId.slice(separator + 1) });
          }}
        >
          {empty ? <EmptyValueTarget /> : children}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0" onOpenAutoFocus={focusFirstControl}>
        {open && (
          <InlineRelationshipPicker
            direction={direction}
            label={label}
            record={record}
            records={records}
            relation={relation}
            onDone={() => setOpen(false)}
            onOpenRecord={onOpenRecord}
          />
        )}
      </PopoverContent>
    </Popover>
  );
});

export const RecordPropertyEditor = observer(function RecordPropertyEditor({
  records,
  record,
  column,
  onDone,
  onOpenRecord,
}: {
  records: RecordsStore;
  record: RecordRow;
  column: RecordColumn<RecordFieldView>;
  onDone: () => void;
  onOpenRecord: (ref: RecordRef) => void;
}) {
  if (column.kind === "relationship") {
    return (
      <InlineRelationshipPicker
        direction={column.direction}
        label={column.label}
        record={record}
        records={records}
        relation={column.relation}
        onDone={onDone}
        onOpenRecord={onOpenRecord}
      />
    );
  }
  if (column.kind !== "field") return null;
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground">{column.label}</p>

      <InlineFieldForm field={column.field} record={record} records={records} onDone={onDone} />
    </>
  );
});
