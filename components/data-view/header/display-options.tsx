"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { Prisma } from "@/generated/prisma";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownAZ, ArrowUpAZ, GripVertical, LayoutGrid, LayoutList, SlidersHorizontal, Table } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CustomColumnType } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ViewMode } from "@/core/base/base-query-builder";
import { cn } from "@/lib/utils";

import { PopoverSection as Section } from "./popover-section";

type DataViewMode = "table" | "grid" | "kanban";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
};

type FieldRowProps = {
  uid: string;
  label: string;
  isVisible: boolean;
  isPinned: boolean;
  onToggle: (visible: boolean) => void;
};

function FieldRow({ uid, label, isVisible, isPinned, onToggle }: FieldRowProps) {
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
        aria-label="Drag to reorder"
        className={cn(
          "flex h-6 w-4 shrink-0 items-center justify-center rounded text-muted-foreground",
          isPinned ? "opacity-20 cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:text-foreground",
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

export const DataViewDisplayOptions = observer(function DataViewDisplayOptions<E extends HasId>({ store }: Props<E>) {
  const t = useTranslations("Common");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const orderedColumns = store.orderedColumns;
  const hiddenSet = new Set(store.hiddenColumns);
  const isCardView = store.viewMode === ViewMode.card;
  const sortable = store.columnsDefinition.filter((col) => col.sortable);
  const singleSelectColumns = store.customColumns.filter((col) => col.type === CustomColumnType.singleSelect);

  const currentSortField = store.sortDescriptor?.field ?? "";
  const currentSortDirection = store.sortDescriptor?.direction ?? "asc";
  const currentGroupingId = store.groupingColumnId ?? "";
  const hasActiveOption = Boolean(currentSortField) || Boolean(currentGroupingId) || store.hiddenColumns.length > 0;

  const currentLayout: DataViewMode =
    store.viewMode === ViewMode.table ? "table" : store.groupingColumnId ? "kanban" : "grid";

  function handleLayoutChange(next: string) {
    if (!next) return;
    switch (next as DataViewMode) {
      case "table":
        store.setViewOptions({ viewMode: ViewMode.table });
        break;
      case "grid":
        store.setViewOptions({ viewMode: ViewMode.card, groupingColumnId: undefined });
        break;
      case "kanban": {
        const defaultGrouping = store.singleSelectCustomColumns[0]?.id ?? store.columnsDefinition[0]?.uid ?? "";
        store.setViewOptions({
          viewMode: ViewMode.card,
          groupingColumnId: store.groupingColumnId ?? defaultGrouping,
        });
        break;
      }
    }
  }

  function handleSortFieldChange(next: string) {
    if (!next) return;
    store.setQueryOptions({
      sortDescriptor: { field: next, direction: currentSortDirection as Prisma.SortOrder },
    });
  }

  function handleSortDirectionChange(next: string) {
    if (!currentSortField) return;
    store.setQueryOptions({
      sortDescriptor: { field: currentSortField, direction: next as Prisma.SortOrder },
    });
  }

  function handleGroupingChange(next: string) {
    store.setViewOptions({ groupingColumnId: next === "__none__" ? undefined : next });
  }

  function handleToggle(uid: string, visible: boolean) {
    if (uid === "name") return;
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

  const sortableIds = orderedColumns.map((c) => c.uid);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={t("ariaLabels.tooltipFields")} className="relative h-8" size="sm" variant="outline">
          <SlidersHorizontal className="size-3.5" />

          {hasActiveOption && (
            <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0 max-h-[70vh] overflow-y-auto">
        <TooltipProvider>
          <div className="flex flex-col">
            <Section label={t("table.layout")}>
              <Tabs value={currentLayout} onValueChange={handleLayoutChange}>
                <TabsList className="w-full border border-input bg-transparent">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-1">
                        <TabsTrigger
                          aria-label={t("ariaLabels.switchToTableView")}
                          className="w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground"
                          value="table"
                        >
                          <Table className="size-3.5" />
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>

                    <TooltipContent>{t("ariaLabels.switchToTableView")}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-1">
                        <TabsTrigger
                          aria-label={t("ariaLabels.switchToCardView")}
                          className="w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground"
                          value="grid"
                        >
                          <LayoutGrid className="size-3.5" />
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>

                    <TooltipContent>{t("ariaLabels.switchToCardView")}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-1">
                        <TabsTrigger
                          aria-label={t("ariaLabels.switchToKanbanView")}
                          className="w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground"
                          value="kanban"
                        >
                          <LayoutList className="size-3.5" />
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>

                    <TooltipContent>{t("ariaLabels.switchToKanbanView")}</TooltipContent>
                  </Tooltip>
                </TabsList>
              </Tabs>
            </Section>

            {sortable.length > 0 && (
              <>
                <Separator />

                <Section label={t("sort.field")}>
                  <div className="flex gap-1 w-full">
                    <Select value={currentSortField} onValueChange={handleSortFieldChange}>
                      <SelectTrigger className="h-8 flex-1" size="sm">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {sortable.map((col) => (
                          <SelectItem key={col.uid} value={col.uid}>
                            {col.label || t(`table.columns.${col.uid}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {currentSortField && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={currentSortDirection === "asc" ? t("sort.descending") : t("sort.ascending")}
                            className="h-8 shrink-0"
                            size="icon"
                            variant="outline"
                            onClick={() => handleSortDirectionChange(currentSortDirection === "asc" ? "desc" : "asc")}
                          >
                            {currentSortDirection === "asc" ? (
                              <ArrowUpAZ className="size-3.5" />
                            ) : (
                              <ArrowDownAZ className="size-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>

                        <TooltipContent>
                          {currentSortDirection === "asc" ? t("sort.ascending") : t("sort.descending")}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </Section>
              </>
            )}

            {isCardView && singleSelectColumns.length > 0 && (
              <>
                <Separator />

                <Section label={t("table.groupBy")}>
                  <Select value={currentGroupingId || "__none__"} onValueChange={handleGroupingChange}>
                    <SelectTrigger className="h-8 w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="__none__">{t("none")}</SelectItem>

                      {singleSelectColumns.map((col) => (
                        <SelectItem key={col.id} value={col.id}>
                          {col.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Section>
              </>
            )}

            {orderedColumns.length > 0 && (
              <>
                <Separator />

                <Section label={t("ariaLabels.tooltipFields")}>
                  <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
                    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-0.5">
                        {orderedColumns.map((col) => {
                          const isPinned = col.uid === "name";
                          const isVisible = !hiddenSet.has(col.uid);
                          const label = col.label || t(`table.columns.${col.uid}`);
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
              </>
            )}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
});
