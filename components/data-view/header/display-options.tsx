"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { Prisma } from "@/generated/prisma";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownAZ, ArrowUpAZ, GripVertical, SlidersHorizontal } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ResponsiveOverlay } from "@/components/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ViewMode } from "@/core/base/base-query-builder";
import { useColumnLabel } from "@/components/data-view/use-column-label";
import { useGroupableFieldLabel } from "@/components/data-view/use-groupable-field-label";
import { cn } from "@/core/utils/cn";
import { useViewAi } from "@/components/data-view/views/use-view-ai";
import { AskAiAction } from "@/components/ui/ask-ai-action";

import { PopoverSection as Section } from "./popover-section";

type DataViewMode = "table" | "board";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  id?: string;
  anchorScope?: string;
};

type FieldRowProps = {
  uid: string;
  label: string;
  isVisible: boolean;
  isPinned: boolean;
  onToggle: (visible: boolean) => void;
};

function FieldRow({ uid, label, isVisible, isPinned, onToggle }: FieldRowProps) {
  const t = useTranslations();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: uid,
    disabled: isPinned,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 rounded-md p-1 text-sm hover:bg-accent",
        isDragging && "bg-accent shadow-md",
      )}
      style={style}
    >
      <button
        aria-label={t("DataView.dragToReorder")}
        className={cn(
          "flex h-6 w-4 shrink-0 items-center justify-center rounded text-muted-foreground",
          isPinned
            ? "opacity-20 cursor-not-allowed"
            : "cursor-grab transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.97] active:cursor-grabbing motion-reduce:transition-none",
        )}
        disabled={isPinned}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      <Label className="flex flex-1 items-center gap-2 font-normal cursor-pointer min-w-0" htmlFor={`field-${uid}`}>
        <Checkbox
          checked={isVisible}
          disabled={isPinned}
          id={`field-${uid}`}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />

        <span className="truncate">{label}</span>
      </Label>
    </div>
  );
}

export const DataViewDisplayOptions = observer(function DataViewDisplayOptions<E extends HasId>({
  store,
  id,
  anchorScope,
}: Props<E>) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const ai = useViewAi(store, {
    registerPageContext: false,
    entry: "appearance",
  });
  const pendingAi = useRef<(() => void) | null>(null);
  const columnLabel = useColumnLabel();
  const groupableLabel = useGroupableFieldLabel();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const orderedColumns = store.orderedColumns;
  const hiddenSet = new Set(store.hiddenColumns);
  const sortable = store.columnsDefinition.filter((col) => col.sortable);
  const canBoard = store.canBoard;

  const currentSortField = store.sortDescriptor?.field ?? "";
  const currentSortDirection = store.sortDescriptor?.direction ?? "asc";
  const currentSortDirectionLabel =
    currentSortDirection === "asc" ? t("Common.sort.ascending") : t("Common.sort.descending");
  const currentGroupingId = store.currentGroupableFieldId;
  const hasActiveOption = Boolean(currentSortField) || Boolean(store.grouping) || store.hiddenColumns.length > 0;

  const currentLayout: DataViewMode = store.viewMode === ViewMode.card && canBoard ? "board" : "table";

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
        direction: currentSortDirection as Prisma.SortOrder,
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
    store.setViewOptions({
      grouping: next === "__none__" ? null : (entry?.grouping ?? null),
    });
  }

  function handleToggle(uid: string, visible: boolean) {
    if (uid === store.primaryColumnId) return;
    const next = new Set(hiddenSet);
    if (visible) next.delete(uid);
    else next.add(uid);
    store.setViewOptions({ hiddenColumns: Array.from(next) });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedColumns.map((c) => c.uid);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    const next = arrayMove(ids, from, to);
    store.setViewOptions({ columnOrder: next });
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
        ai.available && (
          <AskAiAction
            id={id ? `${id}-ask-ai` : undefined}
            onClick={() => {
              pendingAi.current = ai.openCurrent;
              setIsOpen(false);
            }}
          />
        )
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
      <TooltipProvider>
        <div className="flex flex-col">
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
            </Section>
          )}

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

                {currentSortField && (
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

          {store.resetToSharedDefaults && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                runUserAction(async () => {
                  await store.resetToSharedDefaults?.();
                  setIsOpen(false);
                })
              }
            >
              {t("RecordModel.resetDefaults")}
            </Button>
          )}

          {orderedColumns.length > 0 && (
            <Section label={t("Common.table.fields")}>
              <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedColumns.map((c) => c.uid)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-0.5">
                    {orderedColumns.map((col) => {
                      const isPinned = col.uid === store.primaryColumnId;
                      const isVisible = !hiddenSet.has(col.uid);
                      const label = col.label || columnLabel(col.uid);
                      return (
                        <FieldRow
                          key={col.uid}
                          isPinned={isPinned}
                          isVisible={isVisible}
                          label={label}
                          uid={col.uid}
                          onToggle={(v) => handleToggle(col.uid, v)}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </Section>
          )}
        </div>
      </TooltipProvider>
    </ResponsiveOverlay>
  );

  return overlay;
});
