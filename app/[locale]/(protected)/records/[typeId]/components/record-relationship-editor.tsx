"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, X } from "lucide-react";

import type {
  RecordChoicesInput,
  RecordChoicesResult,
  RecordChoice,
} from "@/features/records/get-record-choices.interactor";
import type { RecordRelationship } from "@/features/records/record-model.schema";
import type { RecordEditorStore } from "./record-editor.store";

import { Button } from "@/components/ui/button";
import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "@/components/forms/selection-loading";
import { AppChip } from "@/components/chip/app-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { getRecordChoicesAction } from "../../actions";
import { RecordDetailField } from "./record-detail-field";
import { relationshipColumnKey } from "@/features/records/record-column.schema";

export function useRecordChoices(input: RecordChoicesInput, enabled: boolean, attempt: number) {
  const key = enabled ? JSON.stringify([input, attempt]) : null;
  const [state, setState] = useState<{ key: string; data: RecordChoicesResult | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    const [request] = JSON.parse(key) as [RecordChoicesInput, number];
    void getRecordChoicesAction(request)
      .then((result) => {
        if (active) setState({ key, data: result.ok ? result.data : null, failed: !result.ok });
      })
      .catch(() => {
        if (active) setState({ key, data: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [key]);
  const current = state?.key === key ? state : null;
  return { data: current?.data, failed: current?.failed ?? false, loading: key !== null && current === null };
}

export const RecordRelationshipEditor = observer(function RecordRelationshipEditor({
  store,
  relationship,
  direction,
}: {
  store: RecordEditorStore;
  relationship: RecordRelationship;
  direction: "outgoing" | "incoming";
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [linkedPage, setLinkedPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const debounced = useDebouncedValue(search);
  const outgoing = direction === "outgoing";
  const label = outgoing ? relationship.sourceLabel : relationship.targetLabel;
  const typeId = outgoing ? relationship.targetTypeId : relationship.sourceTypeId;
  const singular = (outgoing ? relationship.sourceCardinality : relationship.targetCardinality) === "one";
  const linked = useRecordChoices(
    {
      typeId,
      page: linkedPage,
      pageSize: 25,
      ...(store.record ? { linkedTo: { ref: store.record.ref, relationId: relationship.id, direction } } : {}),
    },
    store.isOpen && store.record !== null,
    attempt,
  );
  const options = useRecordChoices({ typeId, page, pageSize: 25, search: debounced }, open && store.isOpen, attempt);
  const changes = store.form.linkChanges.filter(
    (change) => change.relationId === relationship.id && change.direction === direction,
  );
  const original = linked.data?.records ?? [];
  const chosen = [
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
  const title = (record: RecordChoice) =>
    record.title.state === "restricted"
      ? t("RecordModel.restricted")
      : record.title.state === "error"
        ? t("RecordModel.calculationError")
        : record.title.state === "value" && record.title.value.kind === "text"
          ? record.title.value.value
          : t("RecordModel.record");
  const editable = !store.isReadOnly && !store.isLoading && !linked.loading && !linked.failed;
  const stage = (record: RecordChoice, action: "link" | "unlink") =>
    store.stageLink({ action, relationId: relationship.id, direction, record: record.ref }, record.title);
  function select(record: RecordChoice) {
    if (!editable || chosen.some((entry) => entry.ref.recordId === record.ref.recordId)) return;
    if (singular) for (const previous of chosen) stage(previous, "unlink");
    stage(record, "link");
    setOpen(false);
    setSearch("");
    setPage(1);
  }
  const id = `relationship-${relationship.id}-${direction}`;
  const error = (retry: () => void) => (
    <div className="flex items-center gap-2 text-sm" role="alert">
      <span>{t("Common.notifications.unexpectedError")}</span>

      <Button size="sm" type="button" variant="secondary" onClick={retry}>
        {t("ErrorCard.retry")}
      </Button>
    </div>
  );
  return (
    <RecordDetailField fieldId={relationshipColumnKey(relationship.id, direction)} inputId={id} label={label}>
      {linked.failed ? (
        error(() => setAttempt((value) => value + 1))
      ) : (
        <div aria-busy={linked.loading || undefined} className="flex flex-wrap gap-1.5">
          {linked.loading && (
            <span aria-label={t("Loading.text")} role="status">
              <SelectionValueSkeleton />
            </span>
          )}

          {!linked.loading && store.isReadOnly && chosen.length === 0 && (
            <span className="text-sm text-muted-foreground">—</span>
          )}

          {chosen.map((record) => (
            <AppChip
              key={record.ref.recordId}
              endContent={
                editable ? (
                  <button
                    aria-label={t("RecordModel.unlinkRecord", { name: title(record) })}
                    className="inline-flex size-5 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => stage(record, "unlink")}
                  >
                    <X className="size-3" />
                  </button>
                ) : undefined
              }
            >
              {title(record)}
            </AppChip>
          ))}
        </div>
      )}

      {linked.data && linked.data.total > linked.data.pageSize && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            disabled={linkedPage === 1 || linked.loading}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setLinkedPage((value) => value - 1)}
          >
            {t("Common.table.previousPage")}
          </Button>

          <span>{t("RecordModel.linkedRecordCount", { count: linked.data.total })}</span>

          <Button
            disabled={linkedPage * linked.data.pageSize >= linked.data.total || linked.loading}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setLinkedPage((value) => value + 1)}
          >
            {t("Common.table.nextPage")}
          </Button>
        </div>
      )}

      {!store.isReadOnly && (
        <Popover modal open={open && editable} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-expanded={open && editable}
              aria-label={label}
              className="w-full justify-between font-normal"
              disabled={!editable}
              id={id}
              role="combobox"
              type="button"
              variant="field"
            >
              <span>{t("RecordModel.linkRecord")}</span>

              <ChevronsUpDown className="size-4 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t("Common.table.search")}
                value={search}
                onValueChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />

              <CommandList aria-busy={options.loading || undefined}>
                {options.loading || search !== debounced ? (
                  <SelectionOptionsSkeleton label={t("Loading.text")} />
                ) : options.failed ? (
                  <div className="p-3">{error(() => setAttempt((value) => value + 1))}</div>
                ) : (
                  <>
                    <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

                    <CommandGroup>
                      {options.data?.records.map((record) => (
                        <CommandItem
                          key={record.ref.recordId}
                          value={record.ref.recordId}
                          onSelect={() => select(record)}
                        >
                          <span className="flex-1 truncate">{title(record)}</span>

                          {chosen.some((entry) => entry.ref.recordId === record.ref.recordId) && (
                            <Check className="size-4" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>

              {options.data && options.data.total > options.data.pageSize && (
                <div className="flex justify-between border-t p-1">
                  <Button
                    disabled={page === 1 || options.loading}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setPage((value) => value - 1)}
                  >
                    {t("Common.table.previousPage")}
                  </Button>

                  <Button
                    disabled={page * options.data.pageSize >= options.data.total || options.loading}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t("Common.table.nextPage")}
                  </Button>
                </div>
              )}
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </RecordDetailField>
  );
});
