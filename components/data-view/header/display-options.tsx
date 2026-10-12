"use client";

import type { Prisma } from "@/generated/prisma";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewGroup } from "@/core/base/grouping/grouping.schema";

import { ArrowDownAZ, ArrowUpAZ, RotateCcw, SlidersHorizontal } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay } from "@/components/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ViewMode } from "@/core/base/base-query-builder";
import { useColumnLabel } from "@/components/data-view/use-column-label";
import { useGroupableFieldLabel } from "@/components/data-view/use-groupable-field-label";
import { useGroupLabel } from "@/components/data-view/group-label";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { ViewChangesNotice } from "@/components/data-view/views/view-changes-notice";
import { AppModalActionRail } from "@/components/modal/app-modal-action";
import { useAskAiAction } from "@/components/ui/ask-ai-action";
import { MANUAL_ORDER_SORT_KEY } from "@/features/records/record-column.schema";

import { ColumnVisibilityList } from "./column-visibility-list";
import { GroupSummaryOptions } from "./group-summary-options";
import { PopoverSection as Section } from "./popover-section";

type DataViewMode = "table" | "board";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  id?: string;
  anchorScope?: string;
};

function HiddenBoardColumns<E extends HasId>({
  store,
  groups,
}: {
  store: BaseDataViewStore<E>;
  groups: DataViewGroup[];
}) {
  const t = useTranslations();
  const groupLabel = useGroupLabel(store.groupingResult);
  return (
    <Section label={t("DataView.hiddenColumns")}>
      <div className="flex flex-col gap-0.5">
        {groups.map((group) => (
          <Label
            key={group.key}
            className="flex items-center gap-2 rounded-md p-1 text-sm font-normal cursor-pointer hover:bg-accent min-w-0"
            htmlFor={`hidden-group-${group.key}`}
          >
            <Checkbox
              checked={false}
              id={`hidden-group-${group.key}`}
              onCheckedChange={(checked) => checked === true && store.showGroup(group.key)}
            />

            <span className="truncate">{groupLabel(group)}</span>
          </Label>
        ))}
      </div>
    </Section>
  );
}

export const DataViewDisplayOptions = observer(function DataViewDisplayOptions<E extends HasId>({
  store,
  id,
  anchorScope,
}: Props<E>) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const askAiAction = useAskAiAction();
  const ai = useViewAi(store, {
    registerPageContext: false,
    entry: "appearance",
  });
  const pendingAi = useRef<(() => void) | null>(null);
  const columnLabel = useColumnLabel();
  const groupableLabel = useGroupableFieldLabel();
  const orderedColumns = store.orderedColumns;
  const hiddenSet = new Set(store.hiddenColumns);
  const canBoard = store.canBoard;

  const currentSortField = store.sortDescriptor?.field ?? "";
  const currentSortDirection = store.sortDescriptor?.direction ?? "asc";
  const currentSortDirectionLabel =
    currentSortDirection === "asc" ? t("Common.sort.ascending") : t("Common.sort.descending");
  const currentGroupingId = store.currentGroupableFieldId;
  const hasActiveOption = Boolean(currentSortField) || Boolean(store.grouping) || store.hiddenColumns.length > 0;

  const currentLayout: DataViewMode = store.viewMode === ViewMode.card && canBoard ? "board" : "table";
  const boardGrouped = currentLayout === "board" && Boolean(store.grouping && store.groupingResult);
  const hiddenGroupKeys = new Set(boardGrouped ? (store.grouping?.hidden ?? []) : []);
  const hiddenGroups = (store.groupingResult?.groups ?? []).filter((group) => hiddenGroupKeys.has(group.key));
  const offersManualOrder =
    (store.supportsManualOrder && currentLayout === "board") || currentSortField === MANUAL_ORDER_SORT_KEY;
  const sortable = [
    ...store.columnsDefinition.filter((col) => col.sortable),
    ...(offersManualOrder ? [{ uid: MANUAL_ORDER_SORT_KEY, label: t("Common.sort.manual") }] : []),
  ];

  function handleLayoutChange(next: string) {
    if (!next) return;
    store.setViewOptions({
      viewMode: (next as DataViewMode) === "board" ? ViewMode.card : ViewMode.table,
    });
  }

  function handleSortFieldChange(next: string) {
    if (!next) return;
    store.setQueryOptions({
      sortDescriptor: {
        field: next,
        direction: next === MANUAL_ORDER_SORT_KEY ? "asc" : (currentSortDirection as Prisma.SortOrder),
      },
    });
  }

  function handleSortDirectionChange(next: string) {
    if (!currentSortField) return;
    store.setQueryOptions({
      sortDescriptor: {
        field: currentSortField,
        direction: next as Prisma.SortOrder,
      },
    });
  }

  function handleGroupingChange(next: string) {
    const entry = store.groupableFields.find((field) => field.id === next);
    const summaries = store.grouping?.summaries;
    store.setViewOptions({
      grouping:
        next === "__none__" || !entry ? null : { ...entry.grouping, ...(summaries?.length ? { summaries } : {}) },
    });
  }

  function handleToggle(uid: string, visible: boolean) {
    if (uid === store.primaryColumnId) return;
    const next = new Set(hiddenSet);
    if (visible) next.delete(uid);
    else next.add(uid);
    store.setViewOptions({ hiddenColumns: Array.from(next) });
  }

  const trigger = (
    <Button
      aria-label={t("Common.ariaLabels.tooltipFields")}
      className="relative h-8"
      id={id}
      size="sm"
      variant="secondary"
    >
      <SlidersHorizontal className="size-3.5" />

      {hasActiveOption && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
      )}
    </Button>
  );

  const overlay = (
    <ResponsiveOverlay
      align="end"
      headerAction={
        <AppModalActionRail
          actions={[
            ...(ai.available
              ? [
                  askAiAction({
                    anchorId: id ? `${id}-ask-ai` : undefined,
                    onClick: () => {
                      pendingAi.current = ai.openCurrent;
                      setIsOpen(false);
                    },
                  }),
                ]
              : []),
            ...(store.resetLayout && store.differsFromDefaultLayout
              ? [
                  {
                    id: "reset-layout",
                    anchorId: id ? `${id}-reset` : undefined,
                    icon: RotateCcw,
                    label: t("RecordModel.resetLayout"),
                    onClick: async () => {
                      await store.resetLayout?.();
                      setIsOpen(false);
                    },
                  },
                ]
              : []),
          ]}
        />
      }
      open={isOpen}
      popoverClassName="w-72"
      title={t("Common.ariaLabels.tooltipFields")}
      trigger={trigger}
      onCloseAutoFocus={(event) => {
        const handoff = pendingAi.current;
        if (!handoff) return;
        event.preventDefault();
        pendingAi.current = null;
        handoff();
      }}
      onOpenChange={setIsOpen}
    >
      <div className="flex flex-col">
        <ViewChangesNotice anchorScope={id ? `${id}-view` : undefined} store={store} />

        {store.supportsBoard && (
          <Section label={t("Common.table.layout")}>
            <SegmentedControl
              items={[
                {
                  value: "table",
                  label: t("Common.table.layouts.table"),
                  id: anchorScope ? `${anchorScope}-layout-table` : undefined,
                  controls: false,
                },
                {
                  value: "board",
                  label: t("Common.table.layouts.board"),
                  id: anchorScope ? `${anchorScope}-layout-board` : undefined,
                  disabled: !canBoard,
                  controls: false,
                },
              ]}
              label={t("Common.table.layout")}
              value={currentLayout}
              onValueChange={handleLayoutChange}
            />

            {!canBoard && (
              <p className="mt-1.5 text-xs text-muted-foreground">{t("Common.ariaLabels.switchToBoardViewDisabled")}</p>
            )}
          </Section>
        )}

        {store.groupableFields.length > 0 && (
          <Section label={t("Common.table.groupBy")}>
            <Select value={currentGroupingId || "__none__"} onValueChange={handleGroupingChange}>
              <SelectTrigger aria-label={t("Common.table.groupBy")} className="h-8 w-full" size="sm">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="__none__">{t("Common.none")}</SelectItem>

                {store.groupableFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {groupableLabel(field)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {boardGrouped && (
              <Label
                className="mt-1 flex items-center justify-between gap-2 text-sm font-normal"
                htmlFor="board-hide-empty"
              >
                {t("DataView.hideEmptyColumns")}

                <Switch
                  checked={Boolean(store.grouping?.hideEmpty)}
                  id="board-hide-empty"
                  size="sm"
                  onCheckedChange={(checked) => store.setHideEmptyGroups(checked)}
                />
              </Label>
            )}
          </Section>
        )}

        <GroupSummaryOptions store={store} />

        {boardGrouped && hiddenGroups.length > 0 && <HiddenBoardColumns groups={hiddenGroups} store={store} />}

        {sortable.length > 0 && (
          <Section label={t("Common.sort.field")}>
            <div className="flex gap-1 w-full">
              <Select value={currentSortField} onValueChange={handleSortFieldChange}>
                <SelectTrigger aria-label={t("Common.sort.field")} className="h-8 flex-1" size="sm">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {sortable.map((col) => (
                    <SelectItem key={col.uid} value={col.uid}>
                      {col.label || columnLabel(col.uid)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {currentSortField && currentSortField !== MANUAL_ORDER_SORT_KEY && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={currentSortDirectionLabel}
                      className="h-8 shrink-0"
                      size="icon"
                      variant="secondary"
                      onClick={() => handleSortDirectionChange(currentSortDirection === "asc" ? "desc" : "asc")}
                    >
                      {currentSortDirection === "asc" ? (
                        <ArrowUpAZ className="size-3.5" />
                      ) : (
                        <ArrowDownAZ className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>

                  <TooltipContent>{currentSortDirectionLabel}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </Section>
        )}

        {orderedColumns.length > 0 && (
          <Section label={t("Common.table.fields")}>
            <ColumnVisibilityList
              items={orderedColumns.map((col) => ({
                uid: col.uid,
                label: col.label || columnLabel(col.uid),
                isVisible: !hiddenSet.has(col.uid),
                isPinned: col.uid === store.primaryColumnId,
              }))}
              onReorder={(columnOrder) => store.setViewOptions({ columnOrder })}
              onToggle={handleToggle}
            />
          </Section>
        )}
      </div>
    </ResponsiveOverlay>
  );

  return overlay;
});
