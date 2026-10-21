"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, X } from "lucide-react";

import type { RecordChoice } from "@/features/records/get-record-choices.interactor";
import type { RecordRelationship } from "@/features/records/record-model.schema";
import type { RecordRelationshipPath } from "@/features/records/record-relationship-path.schema";
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
import { relationshipColumnKey, relationshipPathColumnKey } from "@/features/records/record-column.schema";

export const RECORD_LINK_FRAME_CLASS =
  "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-3 py-1.5 text-sm";
export const RECORD_LINK_FRAME_READ_ONLY_CLASS = "border-input bg-input-background shadow-xs";

type Props = {
  store: RecordEditorStore;
  endContent?: ReactNode;
} & (
  | { relationship: RecordRelationship; direction: "outgoing" | "incoming" }
  | { path: RecordRelationshipPath; targetTypeId: string }
);

export const RecordRelationshipEditor = observer(function RecordRelationshipEditor(props: Props) {
  const { store, endContent } = props;
  const relationship = "relationship" in props ? props.relationship : null;
  const direction = "direction" in props ? props.direction : "outgoing";
  const readOnly = store.isReadOnly || "path" in props;
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
  const label =
    "path" in props ? props.path.label : outgoing ? props.relationship.sourceLabel : props.relationship.targetLabel;
  const typeId =
    "path" in props ? props.targetTypeId : outgoing ? props.relationship.targetTypeId : props.relationship.sourceTypeId;
  const singular =
    relationship !== null && (outgoing ? relationship.sourceCardinality : relationship.targetCardinality) === "one";
  const fieldId =
    "path" in props
      ? relationshipPathColumnKey(props.path.id)
      : relationshipColumnKey(props.relationship.id, direction);
  const recordFilter = store.record
    ? "path" in props
      ? { throughPath: { ref: store.record.ref, pathId: props.path.id } }
      : {
          linkedTo: {
            ref: store.record.ref,
            relationId: props.relationship.id,
            direction,
          },
        }
    : {};
  const linked = useRecordChoices(
    {
      typeId,
      page: 1,
      pageSize: 25,
      ...recordFilter,
    },
    store.isOpen && store.record !== null && !store.trash,
    attempt + store.relatedRevision,
  );
  const changes = relationship
    ? store.form.linkChanges.filter((change) => change.relationId === relationship.id && change.direction === direction)
    : [];
  const initialSummary =
    "path" in props
      ? store.record?.relationshipPaths?.find((entry) => entry.pathId === props.path.id)
      : store.record?.relationships.find(
          (entry) => entry.relationId === props.relationship.id && entry.direction === direction,
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
  const editable = !readOnly && !store.isLoading && !linked.loading && !linked.failed;
  const stage = (record: RecordChoice, action: "link" | "unlink") => {
    if (relationship) {
      store.stageLink(
        {
          action,
          relationId: relationship.id,
          direction,
          record: record.ref,
        },
        record.title,
      );
    }
  };
  function select(record: RecordChoice) {
    if (!editable || chosen.some((entry) => entry.ref.recordId === record.ref.recordId)) return;
    if (singular) for (const previous of chosen) stage(previous, "unlink");
    stage(record, "link");
    setMode(null);
    setSearch("");
    setPage(1);
  }
  const id = `relationship-${fieldId}-${useId()}`;
  const chips = useRef<HTMLDivElement>(null);
  const total = Math.max(
    0,
    (linked.data?.total ?? initialSummary?.readableCount ?? 0) +
      changes.reduce((sum, change) => sum + (change.action === "link" ? 1 : -1), 0),
  );
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
      ...(mode === "linked" ? recordFilter : {}),
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
    <EntityDetailFieldShell fieldId={fieldId} inputId={id} label={label} locked={store.isPermissionReadOnly}>
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
            setMode(value ? ("path" in props ? "linked" : "link") : null);
            setSearch("");
            setPage(1);
          }}
        >
          <PopoverAnchor asChild>
            <div
              ref={chips}
              aria-busy={linked.loading || undefined}
              aria-label={readOnly ? label : undefined}
              className={cn(
                RECORD_LINK_FRAME_CLASS,
                "flex-nowrap",
                endContent && "relative pr-9",
                readOnly
                  ? RECORD_LINK_FRAME_READ_ONLY_CLASS
                  : "border-input bg-input-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
              )}
              data-relationship-field=""
              data-relationship-path-field={"path" in props ? "" : undefined}
              id={`${id}-field`}
              role={readOnly ? "group" : "presentation"}
              tabIndex={readOnly ? -1 : undefined}
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
              {linked.loading && readOnly && chosen.length === 0 && (
                <span aria-label={t("Loading.text")} role="status">
                  <SelectionValueSkeleton />
                </span>
              )}

              {!linked.loading && readOnly && chosen.length === 0 && <EmptyValue />}

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
                    id: `${id}-more`,
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

              {endContent && (
                <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center" data-form-control-end="">
                  {endContent}
                </div>
              )}

              {!readOnly && (
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
