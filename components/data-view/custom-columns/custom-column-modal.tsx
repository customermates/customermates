"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, AlignJustify } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CustomColumnType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormFieldHelp } from "@/components/forms/form-field-help";
import { FormInput } from "@/components/forms/form-input";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { AppModal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/shared/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppChip } from "@/components/chip/app-chip";
import { CHIP_COLORS, type ChipColor } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { cn } from "@/core/utils/cn";
import { CUSTOM_COLUMN_TYPE_ITEMS } from "./custom-column-type-icon";

const COLOR_DOT_CLASSES: Record<ChipColor, string> = {
  default: "bg-primary",
  secondary: "bg-foreground/60",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
};

type SortableOptionItemProps = {
  option: CustomColumnOption;
  index: number;
  labelId: string;
  colorId: string;
  weightId: string;
  showWeight: boolean;
  isWeightReadOnly: boolean;
  isDisabled: boolean;
  canDelete: boolean;
  shouldFocus: boolean;
  onFocused: () => void;
  onChange: (id: string, value: string) => void;
  toggleDefaultOption: (option: CustomColumnOption) => void;
  deleteOption: (option: CustomColumnOption) => void;
};

const SortableOptionItem = observer(
  ({
    option,
    labelId,
    colorId,
    weightId,
    showWeight,
    isWeightReadOnly,
    isDisabled,
    canDelete,
    shouldFocus,
    onFocused,
    onChange,
    toggleDefaultOption,
    deleteOption,
  }: SortableOptionItemProps) => {
    const t = useTranslations();
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: option.value,
      disabled: isDisabled,
    });

    useEffect(() => {
      if (!shouldFocus) return;

      const timer = setTimeout(() => {
        const input = document.getElementById(labelId);
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }

        onFocused();
      }, 0);

      return () => clearTimeout(timer);
    }, [shouldFocus, labelId, onFocused]);

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div ref={setNodeRef} className="flex items-center gap-2 w-full" style={style}>
        <div
          className={
            isDisabled
              ? "flex items-center text-muted-foreground/50"
              : "cursor-move flex items-center text-muted-foreground hover:text-foreground"
          }
          {...(isDisabled ? {} : { ...attributes, ...listeners })}
        >
          <Icon className="size-5" icon={AlignJustify} />
        </div>

        <div className="flex gap-0 w-full">
          <FormInput
            className="rounded-r-none border-r-0"
            containerClassName="flex-1 min-w-0"
            id={labelId}
            label={null}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t(`Common.colors.${option.color}`)}
                className="rounded-l-none border-l-0"
                disabled={isDisabled}
                size="icon"
                type="button"
                variant="field"
              >
                <span className={cn("size-3 inline-block rounded-full", COLOR_DOT_CLASSES[option.color])}>
                  <span className="sr-only">{t(`Common.colors.${option.color}`)}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={option.color ?? ""}
                onValueChange={(color) => {
                  if (color) onChange(colorId, color);
                }}
              >
                {CHIP_COLORS.map((color) => (
                  <DropdownMenuRadioItem key={color} value={color}>
                    <AppChip variant={color}>{t(`Common.colors.${color}`)}</AppChip>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showWeight && (
          <FormNumberInput
            aria-label={t("CompanySettings.forecasting.weightsTitle")}
            className="text-right font-mono tabular-nums"
            containerClassName="w-24 shrink-0"
            endContent={<span className="mr-1.5">%</span>}
            id={weightId}
            label={null}
            readOnly={isWeightReadOnly}
          />
        )}

        <span className="flex w-14 shrink-0 justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={option.isDefault ? t("Common.clearDefault") : t("Common.setAsDefault")}
                aria-pressed={option.isDefault}
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-50",
                  option.isDefault ? "border-primary" : "border-input hover:border-primary/60",
                )}
                disabled={isDisabled}
                type="button"
                onClick={() => toggleDefaultOption(option)}
              >
                {option.isDefault && <span className="size-2 rounded-full bg-primary" />}
              </button>
            </TooltipTrigger>

            <TooltipContent>{option.isDefault ? t("Common.clearDefault") : t("Common.setAsDefault")}</TooltipContent>
          </Tooltip>
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t("Common.actions.delete")}
              className="text-destructive hover:text-destructive"
              disabled={isDisabled || !canDelete}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => deleteOption(option)}
            >
              <Icon icon={Trash2} />
            </Button>
          </TooltipTrigger>

          <TooltipContent>
            {canDelete ? t("Common.actions.delete") : t("Common.inputs.options.lastOption")}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  },
);

export const CustomColumnModal = observer(() => {
  const t = useTranslations();
  const { customColumnModalStore: store } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { form, onChange, addOption, deleteOption, toggleDefaultOption, reorderOptions } = store;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id || form.type !== CustomColumnType.singleSelect) return;

    const options = form.options.options;
    const oldIndex = options.findIndex((opt) => opt.value === active.id);
    const newIndex = options.findIndex((opt) => opt.value === over.id);

    if (oldIndex !== -1 && newIndex !== -1) reorderOptions(oldIndex, newIndex);
  }

  return (
    <AppModal
      actions={
        form.id
          ? [
              {
                id: "delete-custom-field",
                label: t("Common.actions.deleteCustomFields"),
                icon: Trash2,
                variant: "destructive",
                disabled: store.isDisabled,
                onClick: () => showDeleteConfirmation(() => store.deleteColumn(), form.label),
              },
            ]
          : []
      }
      store={store}
      title={form.id ? t("Common.actions.editCustomFields") : t("Common.actions.addCustomField")}
    >
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="grow truncate text-x-lg">
              {form.id ? t("Common.actions.editCustomFields") : t("Common.actions.addCustomField")}
            </h2>
          </AppCardHeader>

          <AppCardBody>
            <FormSelect
              required
              id="type"
              items={CUSTOM_COLUMN_TYPE_ITEMS.map((item) => ({
                value: item.value,
                label: t(`Common.customColumnTypes.${item.value}`),
              }))}
              label={t("Common.inputs.type")}
              labelEndAddon={
                form.id ? (
                  <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: t("Common.inputs.type") })}>
                    {t("Common.customFieldHelp.immutableType")}
                  </FormFieldHelp>
                ) : undefined
              }
              readOnly={Boolean(form.id)}
              onValueChange={(next) => store.changeType(next as CustomColumnType)}
            />

            <FormInput required id="label" label={t("Common.inputs.label")} />

            {(form.type === CustomColumnType.email ||
              form.type === CustomColumnType.phone ||
              form.type === CustomColumnType.link) && (
              <div className="flex w-full flex-col space-y-2 items-start">
                <FormSelect
                  id="options.color"
                  items={CHIP_COLORS.map((color) => ({
                    value: color,
                    label: t(`Common.colors.${color}`),
                    color,
                  }))}
                  label={t("Common.inputs.options.color")}
                />

                <FormSwitch id="options.allowMultiple" label={t("Common.inputs.options.allowMultiple")} />
              </div>
            )}

            {form.type === CustomColumnType.date && (
              <FormSelect
                id="options.displayFormat"
                items={DATE_DISPLAY_FORMATS.map((key) => {
                  const exampleDate = new Date("1970-01-01");
                  const formatFn = intlStore.dateFormatMap[key];
                  const label = key === "relative" ? formatFn(new Date(Date.now() - 86400000)) : formatFn(exampleDate);
                  return { value: key, label };
                })}
                label={t("Common.inputs.options.displayFormat")}
              />
            )}

            {form.type === CustomColumnType.dateTime && (
              <FormSelect
                id="options.displayFormat"
                items={DATE_DISPLAY_FORMATS.map((key) => {
                  const exampleDate = new Date("1970-01-01T12:30:00");
                  const formatFn = intlStore.dateTimeFormatMap[key];
                  const label = key === "relative" ? formatFn(new Date(Date.now() - 86400000)) : formatFn(exampleDate);
                  return { value: key, label };
                })}
                label={t("Common.inputs.options.displayFormat")}
              />
            )}

            {form.type === CustomColumnType.dateRange && (
              <FormSelect
                id="options.displayFormat"
                items={DATE_DISPLAY_FORMATS.map((key) => {
                  const exampleDate = new Date("1970-01-01");
                  const formatFn = intlStore.dateFormatMap[key];
                  const label = key === "relative" ? formatFn(new Date(Date.now() - 86400000)) : formatFn(exampleDate);
                  return { value: key, label };
                })}
                label={t("Common.inputs.options.displayFormat")}
              />
            )}

            {form.type === CustomColumnType.dateTimeRange && (
              <FormSelect
                id="options.displayFormat"
                items={DATE_DISPLAY_FORMATS.map((key) => {
                  const exampleDate = new Date("1970-01-01T12:30:00");
                  const formatFn = intlStore.dateTimeFormatMap[key];
                  const label = key === "relative" ? formatFn(new Date(Date.now() - 86400000)) : formatFn(exampleDate);
                  return { value: key, label };
                })}
                label={t("Common.inputs.options.displayFormat")}
              />
            )}

            {form.type === CustomColumnType.currency && (
              <FormAutocompleteCurrency required id="options.currency" label={t("Common.inputs.options.currency")} />
            )}

            {form.type === CustomColumnType.singleSelect && (
              <div className="flex w-full flex-col space-y-2 items-start">
                <div className="flex w-full items-center gap-2 pl-7 text-xs text-muted-foreground">
                  <span className="flex-1">{t("Common.table.columns.name")}</span>

                  {store.isDealWeightingColumn && (
                    <span className="flex w-24 shrink-0 items-center justify-end gap-1 whitespace-nowrap">
                      <span className="min-w-0 truncate">{t("Common.probability")}</span>

                      {store.isOptionWeightReadOnly && !store.isDisabled ? (
                        <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: t("Common.probability") })}>
                          {t("Common.customFieldHelp.probabilityPermission", { company: t("UserAvatar.company") })}
                        </FormFieldHelp>
                      ) : null}
                    </span>
                  )}

                  <span className="w-14 shrink-0 text-center">{t("Common.default")}</span>

                  <span className="w-8 shrink-0" />
                </div>

                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={form.options.options.map((opt) => opt.value)}
                    strategy={verticalListSortingStrategy}
                  >
                    {form.options.options
                      .slice()
                      .sort((a, b) => a.index - b.index)
                      .map((option, index) => {
                        const labelId = `options.options[${index}].label`;
                        const colorId = `options.options[${index}].color`;
                        const weightId = `options.options[${index}].weight`;

                        return (
                          <SortableOptionItem
                            key={option.value}
                            canDelete={store.canDeleteOption}
                            colorId={colorId}
                            deleteOption={deleteOption}
                            index={index}
                            isDisabled={store.isDisabled}
                            isWeightReadOnly={store.isOptionWeightReadOnly}
                            labelId={labelId}
                            option={option}
                            shouldFocus={store.pendingFocusOptionValue === option.value}
                            showWeight={store.isDealWeightingColumn}
                            toggleDefaultOption={toggleDefaultOption}
                            weightId={weightId}
                            onChange={onChange}
                            onFocused={store.clearPendingFocusOptionValue}
                          />
                        );
                      })}
                  </SortableContext>
                </DndContext>

                <div className="flex w-full items-center gap-2 pl-7">
                  <Button
                    className="flex-1 justify-start text-muted-foreground"
                    disabled={store.isDisabled}
                    type="button"
                    variant="field"
                    onClick={addOption}
                  >
                    <Icon icon={Plus} />

                    {t("Common.inputs.options.addOption")}
                  </Button>

                  {store.isDealWeightingColumn && <span className="w-24 shrink-0" />}

                  <span className="w-14 shrink-0" />

                  <span className="w-8 shrink-0" />
                </div>
              </div>
            )}
          </AppCardBody>

          <AppCardFooter>
            <Button disabled={store.isLoading || !store.hasUnsavedChanges || store.isDisabled} type="submit">
              {t("Common.actions.save")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
