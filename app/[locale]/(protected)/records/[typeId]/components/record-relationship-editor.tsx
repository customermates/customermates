"use client";

import { useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, X } from "lucide-react";

import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordRelationship } from "@/features/records/record-model.schema";
import type { RecordEditorStore } from "./record-editor.store";

import { Button } from "@/components/ui/button";
import { useFocusAfterRemoval } from "@/components/ui/use-focus-after-removal";
import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "@/components/forms/selection-loading";
import { RecordChipIcon } from "@/components/records/record-chip-icon";
import { AppChip } from "@/components/chip/app-chip";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { recordLinkColor } from "@/features/records/record-presentation";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { recordDisplayName } from "@/features/records/record-display-name";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { useRecordChoices } from "@/components/records/use-record-choices";
import { EntityDetailFieldShell } from "@/components/entity-detail/entity-detail-field-shell";
import { EmptyValue } from "@/components/shared/empty-value";
import { relationshipColumnKey } from "@/features/records/record-column.schema";

export const RECORD_LINK_FRAME_CLASS =
  "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-3 py-1.5 text-sm";
export const RECORD_LINK_FRAME_READ_ONLY_CLASS = "border-input bg-input-background shadow-xs";

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
  const [mode, setMode] = useState<"link" | "linked" | null>(null);
  const open = mode !== null;
  const [focusTarget, setFocusTarget] = useState<{
    opener: HTMLElement;
    fallback: HTMLElement | null;
  } | null>(null);
  const focusReturn = useOverlayFocusReturn(open, focusTarget?.opener, focusTarget?.fallback);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const debounced = useDebouncedValue(search);
  const outgoing = direction === "outgoing";
  const label = outgoing ? relationship.sourceLabel : relationship.targetLabel;
  const typeId = outgoing ? relationship.targetTypeId : relationship.sourceTypeId;
  const singular = (outgoing ? relationship.sourceCardinality : relationship.targetCardinality) === "one";
  const linked = useRecordChoices(
    {
      typeId,
      page: 1,
      pageSize: 25,
      ...(store.record
        ? {
            linkedTo: {
              ref: {
                typeId: store.record.ref.typeId,
                recordId: store.record.ref.recordId,
              },
              relationId: relationship.id,
              direction,
            },
          }
        : {}),
    },
    store.isOpen && store.record !== null && !store.trash,
    attempt + store.relatedRevision,
  );
  const changes = store.form.linkChanges.filter(
    (change) => change.relationId === relationship.id && change.direction === direction,
  );
  const initialSummary = store.record?.relationships.find(
    (entry) => entry.relationId === relationship.id && entry.direction === direction,
  );
  const original = linked.data?.records ?? (linked.loading ? (initialSummary?.records ?? []) : []);
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
    recordDisplayName(record.title, store.presentation.linkLabels[record.ref.typeId], t);
  const editable = !store.isReadOnly && !store.isLoading && !linked.loading && !linked.failed;
  const stage = (record: RecordChoice, action: "link" | "unlink") =>
    store.stageLink({ action, relationId: relationship.id, direction, record: record.ref }, record.title);
  function select(record: RecordChoice) {
    if (!editable || chosen.some((entry) => entry.ref.recordId === record.ref.recordId)) return;
    if (singular) for (const previous of chosen) stage(previous, "unlink");
    stage(record, "link");
    setMode(null);
    setSearch("");
    setPage(1);
  }
  const id = `relationship-${relationship.id}-${direction}-${useId()}`;
  const chips = useRef<HTMLDivElement>(null);
  const total = Math.max(
    0,
    (linked.data?.total ?? initialSummary?.readableCount ?? 0) +
      changes.reduce((sum, change) => sum + (change.action === "link" ? 1 : -1), 0),
  );
  const linkedTo = store.record ? { ref: store.record.ref, relationId: relationship.id, direction } : undefined;
  const staged = changes
    .filter((change) => change.action === "link")
    .map((change) => ({ ref: change.record, title: change.title }))
    .filter((record) => !debounced || title(record).toLocaleLowerCase().includes(debounced.toLocaleLowerCase()));
  const stagedPages = mode === "linked" ? Math.ceil(staged.length / 25) : 0;
  const options = useRecordChoices(
    {
      typeId,
      page: Math.max(1, page - stagedPages),
      pageSize: 25,
      search: debounced,
      ...(mode === "linked" ? { linkedTo } : {}),
    },
    open && store.isOpen && (mode === "link" || store.record !== null),
    attempt + store.relatedRevision,
  );
  const persisted =
    options.data?.records.filter(
      (record) =>
        !changes.some((change) => change.action === "unlink" && change.record.recordId === record.ref.recordId),
    ) ?? [];
  const listed = page <= stagedPages ? staged.slice((page - 1) * 25, page * 25) : persisted;
  const resultPages = stagedPages + Math.ceil((options.data?.total ?? 0) / 25);
  useEffect(() => {
    if (!options.loading) setPage((current) => Math.min(current, Math.max(1, resultPages)));
  }, [options.loading, resultPages]);
  const openLinked = (trigger: HTMLElement) => {
    setFocusTarget({
      opener: trigger,
      fallback: document.getElementById(id) ?? chips.current,
    });
    setSearch("");
    setPage(1);
    setMode("linked");
  };
  const focusAfterRemoval = useFocusAfterRemoval();
  const error = (retry: () => void) => (
    <div className="flex items-center gap-2 text-sm" role="alert">
      <span>{t("Common.notifications.unexpectedError")}</span>

      <Button size="sm" type="button" variant="secondary" onClick={retry}>
        {t("ErrorCard.retry")}
      </Button>
    </div>
  );
  return (
    <EntityDetailFieldShell
      fieldId={relationshipColumnKey(relationship.id, direction)}
      inputId={id}
      label={label}
      locked={store.isPermissionReadOnly}
    >
      {linked.failed ? (
        error(() => setAttempt((value) => value + 1))
      ) : (
        <Popover
          modal
          open={open}
          onOpenChange={(value) => {
            if (value) {
              const opener = document.getElementById(id);
              setFocusTarget(opener ? { opener, fallback: null } : null);
            }
            setMode(value ? "link" : null);
            setSearch("");
            setPage(1);
          }}
        >
          <PopoverAnchor asChild>
            <div
              ref={chips}
              aria-busy={linked.loading || undefined}
              aria-label={store.isReadOnly ? label : undefined}
              className={cn(
                RECORD_LINK_FRAME_CLASS,
                "flex-nowrap",
                store.isReadOnly
                  ? RECORD_LINK_FRAME_READ_ONLY_CLASS
                  : "border-input bg-input-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
              )}
              data-relationship-field=""
              id={`${id}-field`}
              role={store.isReadOnly ? "group" : "presentation"}
              tabIndex={store.isReadOnly ? -1 : undefined}
              onClick={(event) => {
                if (!editable || (event.target as Element).closest("button, a, [role=button]")) return;
                document.getElementById(id)?.click();
              }}
              onKeyDown={(event) => {
                if (!editable || event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " "))
                  return;
                event.preventDefault();
                document.getElementById(id)?.click();
              }}
            >
              {linked.loading && store.isReadOnly && chosen.length === 0 && (
                <span aria-label={t("Loading.text")} role="status">
                  <SelectionValueSkeleton />
                </span>
              )}

              {!linked.loading && store.isReadOnly && chosen.length === 0 && <EmptyValue />}

              {(chosen.length > 0 || total > 0) && (
                <AppChipStack
                  extraCount={Math.max(0, total - chosen.length)}
                  items={chosen.map((record) => ({
                    ...record,
                    id: record.ref.recordId,
                    label: title(record),
                  }))}
                  maxRows={3}
                  moreButtonProps={{
                    "aria-haspopup": "dialog",
                    "aria-expanded": mode === "linked",
                    "aria-controls": `${id}-options`,
                  }}
                  moreLabel={(count) => t("RecordModel.moreRecords", { count })}
                  renderChip={(record, index) => (
                    <AppChip
                      data-relationship-chip=""
                      endContent={
                        editable ? (
                          <button
                            aria-label={t("RecordModel.unlinkRecord", {
                              name: title(record),
                            })}
                            className="inline-flex size-5 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                            data-relationship-unlink=""
                            type="button"
                            onClick={() => {
                              stage(record, "unlink");
                              focusAfterRemoval({
                                container: () => chips.current,
                                selector: "[data-chip-id] [data-relationship-unlink]",
                                index,
                                fallback: () => document.getElementById(id) ?? chips.current,
                              });
                            }}
                          >
                            <X className="size-3" />
                          </button>
                        ) : undefined
                      }
                      startContent={<RecordChipIcon icons={store.presentation.linkIcons} typeId={record.ref.typeId} />}
                      variant={recordLinkColor(store.presentation.linkColors, typeId)}
                    >
                      <button
                        aria-label={t("RecordModel.openRecord", {
                          name: title(record),
                        })}
                        className="block max-w-full truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        type="button"
                        onClick={(event) =>
                          store.rootStore.recordWorkspaceStore.open(
                            {
                              typeId: record.ref.typeId,
                              recordId: record.ref.recordId,
                            },
                            event.currentTarget,
                            document.getElementById(id) ?? chips.current,
                          )
                        }
                      >
                        {title(record)}
                      </button>
                    </AppChip>
                  )}
                  onMoreClickWhenLoaded
                  onMoreClick={openLinked}
                />
              )}

              {!store.isReadOnly && (
                <PopoverTrigger asChild>
                  <button
                    aria-busy={linked.loading || undefined}
                    aria-controls={`${id}-options`}
                    aria-expanded={open && editable}
                    aria-label={label}
                    className="flex h-6 min-w-16 flex-1 items-center justify-between gap-2 rounded-sm text-left text-muted-foreground outline-none disabled:cursor-default"
                    disabled={!editable}
                    id={id}
                    role="combobox"
                    type="button"
                  >
                    {linked.loading && chosen.length === 0 ? (
                      <span aria-label={t("Loading.text")} role="status">
                        <SelectionValueSkeleton />
                      </span>
                    ) : (
                      <span className="truncate">{chosen.length === 0 ? t("RecordModel.linkRecord") : null}</span>
                    )}

                    <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
              )}
            </div>
          </PopoverAnchor>

          <PopoverContent
            align="start"
            aria-label={label}
            className="flex min-h-0 w-(--radix-popover-trigger-width) flex-col overflow-hidden p-0"
            id={`${id}-options`}
            {...focusReturn}
            onOpenAutoFocus={() => {
              focusReturn.onOpenAutoFocus();
              document.getElementById(`${id}-options`)?.querySelector<HTMLInputElement>("input")?.focus();
            }}
          >
            <Command className="min-h-0" shouldFilter={false}>
              <CommandInput
                aria-label={t("Common.table.search")}
                placeholder={t("Common.table.search")}
                value={search}
                onValueChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />

              <CommandList
                aria-busy={options.loading || undefined}
                className="min-h-0"
                data-linked-record-list={mode === "linked" ? "" : undefined}
              >
                {options.loading || search !== debounced ? (
                  <SelectionOptionsSkeleton label={t("Loading.text")} />
                ) : options.failed ? (
                  <div className="p-3">{error(() => setAttempt((value) => value + 1))}</div>
                ) : (
                  <>
                    <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

                    <CommandGroup
                      heading={mode === "linked" ? t("RecordModel.linkedRecordCount", { count: total }) : undefined}
                    >
                      {(mode === "linked" ? listed : (options.data?.records ?? [])).map((record) => (
                        <CommandItem
                          key={record.ref.recordId}
                          aria-label={title(record)}
                          value={record.ref.recordId}
                          onSelect={() => {
                            if (mode === "link") select(record);
                            else {
                              store.rootStore.recordWorkspaceStore.open(
                                record.ref,
                                document.activeElement instanceof HTMLElement ? document.activeElement : null,
                                document.getElementById(id) ?? chips.current,
                              );
                            }
                          }}
                        >
                          {mode === "linked" && (
                            <RecordChipIcon icons={store.presentation.linkIcons} typeId={record.ref.typeId} />
                          )}

                          <span className="min-w-0 flex-1 truncate">{title(record)}</span>

                          {mode === "linked" && editable && (
                            <Button
                              aria-label={t("RecordModel.unlinkRecord", { name: title(record) })}
                              className="-my-1"
                              size="icon-xs"
                              type="button"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                stage(record, "unlink");
                                document
                                  .getElementById(`${id}-options`)
                                  ?.querySelector<HTMLInputElement>("input")
                                  ?.focus();
                              }}
                              onKeyDown={(event) => {
                                if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
                              }}
                            >
                              <X className="size-3" />
                            </Button>
                          )}

                          {mode === "link" && chosen.some((entry) => entry.ref.recordId === record.ref.recordId) && (
                            <Check className="size-4" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>

            {resultPages > 1 && (
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
                  disabled={page >= resultPages || options.loading}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t("Common.table.nextPage")}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </EntityDetailFieldShell>
  );
});
