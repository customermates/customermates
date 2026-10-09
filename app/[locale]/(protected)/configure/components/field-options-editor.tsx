"use client";

import type { CSSProperties, ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { FieldModalStore } from "./field-modal";
import type { OptionAttributeColumn } from "./field-option-columns";

import { useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";

import { RecordRowActions } from "@/app/[locale]/(protected)/records/[typeId]/components/record-row-actions";
import { AppForm } from "@/components/forms/form-context";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { AppModalCloseContext } from "@/components/modal/app-modal-close-context";
import { DragHandle } from "@/components/shared/drag-handle";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFocusAfterRemoval } from "@/components/ui/use-focus-after-removal";
import { CHIP_COLORS, toChipColor } from "@/constants/chip-colors";
import { cn } from "@/core/utils/cn";
import { AttributeColumnStore } from "./attribute-column.store";
import { literalText } from "./calculation-flow";
import { attributeKeyTaken, OPTION_ATTRIBUTE_TYPES, PROBABILITY_ATTRIBUTE } from "./field-option-columns";

const ROW_GRID = "grid items-start gap-2 grid-cols-[1.75rem_6.5rem_minmax(0,1fr)_1.75rem]";
const ROW_AREAS = [
  "[grid-template-areas:'drag_color_name_menu']",
  "[grid-template-areas:'drag_color_name_menu'_'._cells_cells_.']",
];
const WIDE_ROW_GRID = [
  "@md/options:grid-cols-(--option-grid) @md/options:[grid-template-areas:none]",
  "@min-[35rem]/options:grid-cols-(--option-grid) @min-[35rem]/options:[grid-template-areas:none]",
  "@min-[43rem]/options:grid-cols-(--option-grid) @min-[43rem]/options:[grid-template-areas:none]",
  "",
];
const WRAPPED_ROW = [
  "border-b pb-3 last:border-b-0 last:pb-0 @md/options:border-b-0 @md/options:pb-0",
  "border-b pb-3 last:border-b-0 last:pb-0 @min-[35rem]/options:border-b-0 @min-[35rem]/options:pb-0",
  "border-b pb-3 last:border-b-0 last:pb-0 @min-[43rem]/options:border-b-0 @min-[43rem]/options:pb-0",
  "border-b pb-3 last:border-b-0 last:pb-0",
];
const WIDE_CELLS = ["@md/options:contents", "@min-[35rem]/options:contents", "@min-[43rem]/options:contents", ""];
const WIDE_PLACEMENT = [
  "@md/options:[grid-area:auto]",
  "@min-[35rem]/options:[grid-area:auto]",
  "@min-[43rem]/options:[grid-area:auto]",
  "",
];
const WIDE_OPTION_LABEL = [
  "@md/options:[grid-area:auto/span_2]",
  "@min-[35rem]/options:[grid-area:auto/span_2]",
  "@min-[43rem]/options:[grid-area:auto/span_2]",
  "",
];

function wideStep(columns: number) {
  return Math.max(columns - 1, 0);
}

const AttributeColumnPopover = observer(function AttributeColumnPopover({
  store,
  columnId,
  open,
  onOpenChange,
  returnFocus,
  children,
}: {
  store: FieldModalStore;
  columnId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [form] = useState(() => new AttributeColumnStore(store, columnId));
  const close = () => onOpenChange(false);
  const modalClose = { requestClose: close, guardsUnsavedChanges: true };
  useEffect(() => {
    if (open) form.start();
  }, [open, form]);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {children}

      <PopoverContent
        align="end"
        className="w-72"
        onCloseAutoFocus={(event) => {
          if (!returnFocus) return;
          event.preventDefault();
          returnFocus();
        }}
        onOpenAutoFocus={(event) => {
          const input = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>("input");
          input?.focus();
        }}
      >
        <AppModalCloseContext.Provider value={modalClose}>
          <AppForm
            store={form}
            onSubmit={() => {
              if (form.submit()) close();
            }}
          >
            <div className="flex flex-col gap-3" data-attribute-column-form="">
              <FormInput id="key" label={t("RecordModel.attribute")} maxLength={64} />

              {!form.column && (
                <FormSelect
                  id="type"
                  items={OPTION_ATTRIBUTE_TYPES.map((value) => ({ value, label: t(`RecordModel.types.${value}`) }))}
                  label={t("RecordModel.valueType")}
                />
              )}

              {!form.column && !attributeKeyTaken(store.form.choices.columns, PROBABILITY_ATTRIBUTE) && (
                <div className="flex flex-col items-start gap-1.5">
                  <span className="text-xs text-muted-foreground">{t("RecordModel.suggestedAttribute")}</span>

                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      store.addAttributeColumn(PROBABILITY_ATTRIBUTE, "number");
                      close();
                    }}
                  >
                    <Plus aria-hidden className="size-4" />

                    {t("RecordModel.probability")}
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <FormFooterActions placement="overlay" />
              </div>
            </div>
          </AppForm>
        </AppModalCloseContext.Provider>
      </PopoverContent>
    </Popover>
  );
});

const AttributeColumnHeader = observer(function AttributeColumnHeader({
  store,
  column,
  label,
  onRemoved,
}: {
  store: FieldModalStore;
  column: OptionAttributeColumn;
  label: string;
  onRemoved: () => void;
}) {
  const t = useTranslations();
  const [renaming, setRenaming] = useState(false);
  const keepFocus = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const probability = column.key === PROBABILITY_ATTRIBUTE;
  const moreLabel = t("RecordModel.moreActions", { name: label });
  return (
    <AttributeColumnPopover
      columnId={column.id}
      open={renaming}
      returnFocus={() => menuButton.current?.focus()}
      store={store}
      onOpenChange={setRenaming}
    >
      <PopoverAnchor asChild>
        <div className="flex min-h-6 min-w-0 items-center gap-0.5" data-option-column={column.key}>
          <span className="min-w-0 truncate text-xs leading-4 font-medium text-muted-foreground">{label}</span>

          {!store.isDisabled && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      ref={menuButton}
                      aria-label={moreLabel}
                      className="text-muted-foreground"
                      size="icon-xs"
                      variant="ghost"
                    >
                      <Ellipsis aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>

                <TooltipContent>{moreLabel}</TooltipContent>
              </Tooltip>

              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (!keepFocus.current) return;
                  keepFocus.current = false;
                  event.preventDefault();
                  setRenaming(true);
                }}
              >
                {!probability && (
                  <DropdownMenuItem
                    onSelect={() => {
                      keepFocus.current = true;
                    }}
                  >
                    <Pencil className="size-4" />

                    {t("RecordModel.renameAttribute")}
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    store.removeAttributeColumn(column.id);
                    onRemoved();
                  }}
                >
                  <Trash2 className="size-4" />

                  {t("Common.actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </PopoverAnchor>
    </AttributeColumnPopover>
  );
});

const OptionCellInput = observer(function OptionCellInput({
  store,
  column,
  index,
  label,
}: {
  store: FieldModalStore;
  column: OptionAttributeColumn;
  index: number;
  label: string;
}) {
  const t = useTranslations();
  const id = `choices.options.${index}.cells.${column.id}`;
  const cell = store.form.choices.options[index]?.cells[column.id];
  if (column.type === "boolean") {
    return (
      <FormSelect
        ariaLabel={label}
        containerClassName="min-w-0"
        id={id}
        items={[
          { value: "true", label: t("RecordModel.yes") },
          { value: "false", label: t("RecordModel.no") },
          { value: "none", label: t("RecordModel.missing") },
        ]}
        label={null}
        value={typeof cell === "string" ? cell : ""}
        onValueChange={(value) => store.onChange(id, value === "none" ? "" : value)}
      />
    );
  }
  if (column.type === "preserved") {
    return (
      <Input
        readOnly
        aria-label={label}
        value={
          cell && typeof cell !== "string"
            ? literalText(cell, store.model, (key: string, values?: Record<string, string>) => t(key, values))
            : ""
        }
      />
    );
  }
  return (
    <FormInput
      aria-label={label}
      containerClassName="min-w-0"
      id={id}
      inputMode={column.type === "number" ? "decimal" : undefined}
      label={null}
    />
  );
});

const OptionRow = observer(function OptionRow({
  store,
  index,
  columnLabel,
  step,
  style,
  onDelete,
}: {
  store: FieldModalStore;
  index: number;
  columnLabel: (column: OptionAttributeColumn) => string;
  step: number;
  style: CSSProperties;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const option = store.form.choices.options[index];
  const sortable = useSortable({ id: option.id, disabled: store.isDisabled });
  const name = option.label.trim() || t("RecordModel.option");
  return (
    <li
      ref={sortable.setNodeRef}
      className={cn(
        "group/row relative bg-background",
        ROW_GRID,
        ROW_AREAS[Number(store.form.choices.columns.length > 0)],
        WIDE_ROW_GRID[step],
        store.form.choices.columns.length > 0 && WRAPPED_ROW[step],
        sortable.isDragging && "z-10 shadow-md",
      )}
      data-focus-target={store.form.id ? `option:${store.form.id}.${option.id}` : undefined}
      data-option-row={option.id}
      style={{ ...style, transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
    >
      <DragHandle
        attributes={sortable.attributes}
        className={cn("mt-1 [grid-area:drag]", WIDE_PLACEMENT[step], store.isDisabled && "invisible")}
        label={`${t("DataView.dragToReorder")}: ${name}`}
        listeners={sortable.listeners}
        setActivatorNodeRef={sortable.setActivatorNodeRef}
      />

      <FormSelect
        ariaLabel={t("RecordModel.color")}
        containerClassName={cn("min-w-0 [grid-area:color]", WIDE_PLACEMENT[step])}
        id={`choices.options.${index}.color`}
        items={CHIP_COLORS.map((color) => ({ value: color, label: t(`Common.colors.${color}`), color }))}
        label={null}
        value={toChipColor(option.color)}
      />

      <FormInput
        aria-label={t("RecordModel.option")}
        containerClassName={cn("min-w-0 [grid-area:name]", WIDE_PLACEMENT[step])}
        id={`choices.options.${index}.label`}
        label={null}
      />

      {store.form.choices.columns.length > 0 && (
        <div
          className={cn(
            "grid min-w-0 grid-cols-(--option-cells) gap-2 [grid-area:cells]",
            WIDE_CELLS[step],
            WIDE_PLACEMENT[step],
          )}
        >
          {store.form.choices.columns.map((column) => (
            <OptionCellInput key={column.id} column={column} index={index} label={columnLabel(column)} store={store} />
          ))}
        </div>
      )}

      <div className={cn("mt-1 [grid-area:menu]", WIDE_PLACEMENT[step])}>
        {!store.isDisabled && <RecordRowActions name={name} onDelete={onDelete} />}
      </div>
    </li>
  );
});

export const FieldOptionsEditor = observer(function FieldOptionsEditor({ store }: { store: FieldModalStore }) {
  const t = useTranslations();
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [adding, setAdding] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const focusAfterRemoval = useFocusAfterRemoval();
  const refocus = (selector: string, index: number) =>
    focusAfterRemoval({
      container: () => editor.current,
      selector,
      index,
      fallback: () => editor.current?.querySelector<HTMLElement>("[data-add-option]") ?? null,
    });
  const columns = store.form.choices.columns;
  const step = wideStep(columns.length);
  const style = {
    "--option-grid": `1.75rem 6.5rem minmax(0,1fr) ${columns.map(() => "7rem").join(" ")} 1.75rem`,
    "--option-cells": "repeat(auto-fill, minmax(7rem, 1fr))",
  } as CSSProperties;
  const columnLabel = (column: OptionAttributeColumn) =>
    column.key === PROBABILITY_ATTRIBUTE ? t("RecordModel.probability") : column.key;
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (store.isDisabled || !over || active.id === over.id) return;
    store.moveOption(String(active.id), String(over.id));
  };
  return (
    <CollapsibleSection
      defaultOpen
      actions={
        !store.form.multiple &&
        !store.isDisabled && (
          <AttributeColumnPopover open={adding} store={store} onOpenChange={setAdding}>
            <PopoverTrigger asChild>
              <Button className="text-muted-foreground" size="xs" variant="ghost">
                <Plus aria-hidden />

                {t("RecordModel.addAttribute")}
              </Button>
            </PopoverTrigger>
          </AttributeColumnPopover>
        )
      }
      summary={t("RecordModel.optionCount", { count: store.form.choices.options.length })}
      title={t("RecordModel.options")}
    >
      <div ref={editor} className="@container/options flex flex-col gap-2" data-option-editor="">
        {(store.form.choices.options.length > 0 || columns.length > 0) && (
          <div
            className={cn(ROW_GRID, ROW_AREAS[Number(columns.length > 0)], WIDE_ROW_GRID[step], "gap-y-1")}
            data-option-header=""
            style={style}
          >
            <span aria-hidden className={cn("[grid-area:drag]", WIDE_PLACEMENT[step])} />

            <span
              className={cn(
                "col-span-2 col-start-2 row-start-1 truncate text-xs leading-6 font-medium text-muted-foreground",
                WIDE_OPTION_LABEL[step],
              )}
            >
              {t("RecordModel.option")}
            </span>

            {columns.length > 0 && (
              <div className={cn("grid min-w-0 grid-cols-(--option-cells) gap-2 [grid-area:cells]", WIDE_CELLS[step])}>
                {columns.map((column) => (
                  <AttributeColumnHeader
                    key={column.id}
                    column={column}
                    label={columnLabel(column)}
                    store={store}
                    onRemoved={() => refocus("[data-option-column] button", columns.indexOf(column))}
                  />
                ))}
              </div>
            )}

            <span aria-hidden className={cn("[grid-area:menu]", WIDE_PLACEMENT[step])} />
          </div>
        )}

        {store.form.choices.options.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("RecordModel.noOptions")}</p>
        )}

        <DndContext collisionDetection={closestCenter} id={dndId} sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={store.form.choices.options.map((option) => option.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-2">
              {store.form.choices.options.map((option, index) => (
                <OptionRow
                  key={option.id}
                  columnLabel={columnLabel}
                  index={index}
                  step={step}
                  store={store}
                  style={style}
                  onDelete={() => {
                    store.removeOption(option.id);
                    refocus("[data-option-row] input[id$='.label']", index);
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {!store.isDisabled && (
          <div>
            <Button data-add-option="" size="sm" type="button" variant="secondary" onClick={store.addOption}>
              <Plus aria-hidden className="size-4" />

              {t("RecordModel.addOption")}
            </Button>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
});
