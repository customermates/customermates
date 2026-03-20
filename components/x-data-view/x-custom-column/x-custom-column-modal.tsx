"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { CustomColumnOption } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { Button } from "@heroui/button";
import { Dropdown, DropdownMenu, DropdownTrigger } from "@heroui/dropdown";
import { useTranslations } from "next-intl";
import {
  CalendarIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ListBulletIcon,
  PlusIcon,
  TrashIcon,
  GlobeAltIcon,
  EnvelopeIcon,
  PhoneIcon,
  ClockIcon,
  Bars2Icon,
} from "@heroicons/react/24/outline";
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
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardDefaultHeader } from "@/components/x-card/x-card-default-header";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { XModal } from "@/components/x-modal/x-modal";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSwitch } from "@/components/x-inputs/x-switch";
import { CURRENCIES } from "@/constants/currencies";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { XIcon } from "@/components/x-icon";
import { XChip } from "@/components/x-chip/x-chip";
import { XDropdownItem } from "@/components/x-inputs/x-dropdown-item";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";

const COLUMN_TYPES = [
  { key: CustomColumnType.plain, icon: <XIcon icon={DocumentTextIcon} /> },
  { key: CustomColumnType.date, icon: <XIcon icon={CalendarIcon} /> },
  { key: CustomColumnType.dateTime, icon: <XIcon icon={ClockIcon} /> },
  { key: CustomColumnType.currency, icon: <XIcon icon={CurrencyDollarIcon} /> },
  { key: CustomColumnType.link, icon: <XIcon icon={GlobeAltIcon} /> },
  { key: CustomColumnType.email, icon: <XIcon icon={EnvelopeIcon} /> },
  { key: CustomColumnType.phone, icon: <XIcon icon={PhoneIcon} /> },
  { key: CustomColumnType.singleSelect, icon: <XIcon icon={ListBulletIcon} /> },
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
              ? "flex items-center text-default-300"
              : "cursor-move flex items-center text-default-400 hover:text-default-600"
          }
          {...(isDisabled ? {} : { ...attributes, ...listeners })}
        >
          <XIcon className="w-5 h-5 text-subdued" icon={Bars2Icon} />
        </div>

        <div className="flex gap-0 w-full">
          <XInput
            classNames={{
              inputWrapper: "rounded-r-none border-r-0.5",
            }}
            id={labelId}
            label={null}
            size="sm"
          />

          <Dropdown>
            <DropdownTrigger>
              <Button
                isIconOnly
                className="rounded-l-none border-l-0.5"
                isDisabled={isDisabled}
                size="sm"
                variant="flat"
              >
                <div className={`w-3 h-3 rounded-full bg-${option.color}`} />
              </Button>
            </DropdownTrigger>

            <DropdownMenu
              selectedKeys={option.color ? new Set([option.color]) : new Set()}
              selectionMode="single"
              onSelectionChange={(keys) => {
                const color = Array.from(keys)[0]?.toString();
                if (color) onChange(colorId, color);
              }}
            >
              {CHIP_COLORS.map((color) =>
                XDropdownItem({
                  key: color,
                  children: <XChip color={color}>{t(`Common.colors.${color}`)}</XChip>,
                }),
              )}
            </DropdownMenu>
          </Dropdown>
        </div>

        <Button
          color={option.isDefault ? "primary" : "default"}
          isDisabled={isDisabled}
          size="sm"
          variant={option.isDefault ? "solid" : "flat"}
          onPress={() => toggleDefaultOption(option)}
        >
          {t("Common.default")}
        </Button>

        <Button
          isIconOnly
          color="danger"
          isDisabled={isDisabled}
          size="sm"
          variant="flat"
          onPress={() => deleteOption(option)}
        >
          <XIcon icon={TrashIcon} />
        </Button>
      </div>
    );
  },
);

export const XCustomColumnModal = observer(() => {
  const t = useTranslations("");
  const { xCustomColumnModalStore: store, intlStore } = useRootStore();
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
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardDefaultHeader
            title={form.id ? t("Common.actions.editCustomFields") : t("Common.actions.addCustomField")}
          >
            {form.id && (
              <Button
                color="danger"
                isDisabled={store.isDisabled}
                size="sm"
                variant="flat"
                onPress={() => showDeleteConfirmation(() => store.deleteColumn(), form.label)}
              >
                {t("Common.actions.deleteCustomFields")}
              </Button>
            )}
          </XCardDefaultHeader>

          <XCardBody>
            <XSelect
              autoFocus
              disallowEmptySelection
              isRequired
              id="type"
              isDisabled={Boolean(form.id)}
              items={COLUMN_TYPES}
              onSelectionChange={(keys) => {
                const key = new Set(keys).values().next().value as CustomColumnType;
                store.changeType(key);
              }}
            >
              {({ key, icon }) =>
                XSelectItem({
                  key: key,
                  startContent: icon,
                  children: t(`Common.customColumnTypes.${key}`),
                })
              }
            </XSelect>

            <XInput autoFocus isRequired id="label" />

            {(form.type === CustomColumnType.email ||
              form.type === CustomColumnType.phone ||
              form.type === CustomColumnType.link) && (
              <div className="flex w-full flex-col space-y-2 items-start">
                <XSelect
                  disallowEmptySelection
                  isMultiline
                  id="options.color"
                  items={CHIP_COLORS.map((color) => ({ key: color }))}
                  renderValue={(items) =>
                    items.map((item) => (
                      <XChip key={item.key} color={item.data?.key}>
                        {t(`Common.colors.${item.data?.key}`)}
                      </XChip>
                    ))
                  }
                >
                  {({ key }) =>
                    XSelectItem({
                      key: key,
                      children: <XChip color={key}>{t(`Common.colors.${key}`)}</XChip>,
                    })
                  }
                </XSelect>

                <XSwitch className="mt-2" id="options.allowMultiple">
                  {t("Common.inputs.options.allowMultiple")}
                </XSwitch>
              </div>
            )}

            {form.type === CustomColumnType.date && (
              <XSelect
                disallowEmptySelection
                id="options.displayFormat"
                items={DATE_DISPLAY_FORMATS.map((format) => ({ key: format }))}
              >
                {({ key }) => {
                  const exampleDate = new Date("1970-01-01");
                  const formatFn = intlStore.dateFormatMap[key];

                  const children =
                    key === "relative" ? formatFn(new Date(Date.now() - 86400000)) : formatFn(exampleDate);

                  return XSelectItem({ key, children });
                }}
              </XSelect>
            )}

            {form.type === CustomColumnType.dateTime && (
              <XSelect
                disallowEmptySelection
                id="options.displayFormat"
                items={DATE_DISPLAY_FORMATS.map((format) => ({ key: format }))}
              >
                {({ key }) => {
                  const exampleDate = new Date("1970-01-01T12:30:00");
                  const formatFn = intlStore.dateTimeFormatMap[key];

                  const children =
                    key === "relative" ? formatFn(new Date(Date.now() - 86400000)) : formatFn(exampleDate);

                  return XSelectItem({ key, children });
                }}
              </XSelect>
            )}

            {form.type === CustomColumnType.currency && (
              <XSelect disallowEmptySelection isRequired id="options.currency" items={CURRENCIES}>
                {({ key }) =>
                  XSelectItem({
                    key: key,
                    children: t(`Common.currencies.${key}`),
                  })
                }
              </XSelect>
            )}

            {form.type === CustomColumnType.singleSelect && (
              <div className="flex w-full flex-col space-y-2 items-start">
                <div className="flex w-full justify-between items-center gap-3">
                  <h3 className="text-x-md">{t("Common.options")}</h3>

                  <Button
                    color="primary"
                    isDisabled={store.isDisabled}
                    isIconOnly={true}
                    size="sm"
                    variant="flat"
                    onPress={addOption}
                  >
                    <XIcon icon={PlusIcon} />
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
          </XCardBody>

          <XCardModalDefaultFooter store={store} />
        </XCard>
      </XForm>
    </XModal>
  );
});
