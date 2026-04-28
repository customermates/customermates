"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import {
  Calendar,
  CalendarRange,
  FileText,
  DollarSign,
  List,
  Plus,
  Trash2,
  Globe,
  Mail,
  Phone,
  Clock,
  AlignJustify,
} from "lucide-react";
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
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { AppModal, ModalFooter } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppChip } from "@/components/chip/app-chip";
import { CURRENCIES } from "@/constants/currencies";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";

const COLUMN_TYPES = [
  { value: CustomColumnType.plain, icon: FileText },
  { value: CustomColumnType.date, icon: Calendar },
  { value: CustomColumnType.dateTime, icon: Clock },
  { value: CustomColumnType.dateRange, icon: CalendarRange },
  { value: CustomColumnType.dateTimeRange, icon: CalendarRange },
  { value: CustomColumnType.currency, icon: DollarSign },
  { value: CustomColumnType.link, icon: Globe },
  { value: CustomColumnType.email, icon: Mail },
  { value: CustomColumnType.phone, icon: Phone },
  { value: CustomColumnType.singleSelect, icon: List },
] as const;

type SortableOptionItemProps = {
  option: CustomColumnOption;
  index: number;
  labelId: string;
  colorId: string;
  isDisabled: boolean;
  onChange: (id: string, value: string) => void;
  toggleDefaultOption: (option: CustomColumnOption) => void;
  deleteOption: (option: CustomColumnOption) => void;
};

const SortableOptionItem = observer(
  ({ option, labelId, colorId, isDisabled, onChange, toggleDefaultOption, deleteOption }: SortableOptionItemProps) => {
    const t = useTranslations("");
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
      id: option.value,
      disabled: isDisabled,
    });

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
                className="rounded-l-none border-l-0"
                disabled={isDisabled}
                size="icon"
                type="button"
                variant="secondary"
              >
                <AppChip className="size-3 min-w-3 min-h-3 p-0 rounded-full" variant={option.color}>
                  <span className="sr-only">{t(`Common.colors.${option.color}`)}</span>
                </AppChip>
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

        <Button
          disabled={isDisabled}
          size="sm"
          type="button"
          variant={option.isDefault ? "default" : "secondary"}
          onClick={() => toggleDefaultOption(option)}
        >
          {t("Common.default")}
        </Button>

        <Button
          disabled={isDisabled}
          size="icon"
          type="button"
          variant="destructive"
          onClick={() => deleteOption(option)}
        >
          <Icon icon={Trash2} />
        </Button>
      </div>
    );
  },
);

export const CustomColumnModal = observer(() => {
  const t = useTranslations("");
  const { customColumnModalStore: store, intlStore } = useRootStore();
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
    <AppModal store={store} title={form.id ? t("Common.actions.editCustomFields") : t("Common.actions.addCustomField")}>
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <h2 className="text-x-lg grow">
              {form.id ? t("Common.actions.editCustomFields") : t("Common.actions.addCustomField")}
            </h2>

            {form.id && (
              <Button
                disabled={store.isDisabled}
                size="sm"
                type="button"
                variant="destructive"
                onClick={() => showDeleteConfirmation(() => store.deleteColumn(), form.label)}
              >
                {t("Common.actions.deleteCustomFields")}
              </Button>
            )}
          </AppCardHeader>

          <AppCardBody>
            <FormSelect
              required
              id="type"
              items={COLUMN_TYPES.map((item) => ({
                value: item.value,
                label: t(`Common.customColumnTypes.${item.value}`),
              }))}
              label={t("Common.inputs.type")}
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
              <FormSelect
                required
                id="options.currency"
                items={CURRENCIES.map(({ key }) => ({ value: key, label: t(`Common.currencies.${key}`) }))}
                label={t("Common.inputs.options.currency")}
              />
            )}

            {form.type === CustomColumnType.singleSelect && (
              <div className="flex w-full flex-col space-y-2 items-start">
                <div className="flex w-full justify-between items-center gap-3">
                  <h3 className="text-x-md">{t("Common.options")}</h3>

                  <Button disabled={store.isDisabled} size="icon" type="button" variant="default" onClick={addOption}>
                    <Icon icon={Plus} />
                  </Button>
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

                        return (
                          <SortableOptionItem
                            key={option.value}
                            colorId={colorId}
                            deleteOption={deleteOption}
                            index={index}
                            isDisabled={store.isDisabled}
                            labelId={labelId}
                            option={option}
                            toggleDefaultOption={toggleDefaultOption}
                            onChange={onChange}
                          />
                        );
                      })}
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </AppCardBody>

          <ModalFooter className="p-6 pt-0">
            <Button disabled={store.isLoading} type="button" variant="secondary" onClick={store.close}>
              {t("Common.actions.close")}
            </Button>

            <Button disabled={store.isLoading || !store.hasUnsavedChanges || store.isDisabled} type="submit">
              {t("Common.actions.save")}
            </Button>
          </ModalFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
