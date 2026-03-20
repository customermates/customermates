"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Avatar } from "@heroui/avatar";
import { Button } from "@heroui/button";
import { Tab, Tabs } from "@heroui/tabs";
import { TrashIcon } from "@heroicons/react/24/outline";
import { EntityType } from "@/generated/prisma";

import { XModal } from "@/components/x-modal/x-modal";
import { XForm } from "@/components/x-inputs/x-form";
import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { ErrorIndicator } from "@/components/x-card/error-indicator";
import { useErrorIndicator } from "@/components/x-card/use-error-indicator";
import { XInput } from "@/components/x-inputs/x-input";
import { XSelect } from "@/components/x-inputs/x-select";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChip } from "@/components/x-chip/x-chip";
import { DisplayType } from "@/features/widget/widget.types";
import { XIcon } from "@/components/x-icon";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";
import { XSwitch } from "@/components/x-inputs/x-switch";
import { XFilterField } from "@/components/x-data-view/x-filter-modal/x-filter-field";
import { getChartColors } from "@/constants/chart-colors";

type Props = {
  customColumns: CustomColumnDto[];
  filterableFields: Record<EntityType, FilterableField[]>;
};

export const WidgetModal = observer(({ customColumns, filterableFields }: Props) => {
  const t = useTranslations("");
  const { widgetModalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { resolvedTheme } = useTheme();
  const { form, canManage, isDisabled, companyWideWidgets } = widgetModalStore;
  const showTemplateSelection =
    !form.id && widgetModalStore.companyWideWidgets.length > 0 && !widgetModalStore.hasUnsavedChanges;
  const chartColors = getChartColors(resolvedTheme);
  const showErrorIndicator = useErrorIndicator(widgetModalStore.error);

  useEffect(() => {
    widgetModalStore.setCustomColumns(customColumns);
    widgetModalStore.setFilterableFields(filterableFields);
  }, [customColumns, filterableFields]);

  return (
    <XModal store={widgetModalStore}>
      <XForm store={widgetModalStore}>
        <XCard>
          <XCardHeader>
            <div className="flex w-full justify-between items-center gap-3">
              <h2 className="text-x-lg">{t("Dashboard.widget")}</h2>

              {canManage && form.id && (
                <Button
                  isIconOnly
                  color="danger"
                  isDisabled={isDisabled}
                  size="sm"
                  variant="flat"
                  onPress={() => showDeleteConfirmation(() => void widgetModalStore.delete())}
                >
                  <XIcon icon={TrashIcon} />
                </Button>
              )}
            </div>
          </XCardHeader>

          <XCardBody>
            <Tabs aria-label={t("Dashboard.widget")} variant="bordered">
              <Tab
                key="config"
                title={
                  <div className="flex items-center gap-2">
                    <span>{t("Dashboard.tabs.config")}</span>

                    {showErrorIndicator && <ErrorIndicator />}
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {showTemplateSelection && (
                    <XSelect
                      disallowEmptySelection
                      description={t("Dashboard.selectWidgetTemplateDescription")}
                      id="template"
                      items={companyWideWidgets}
                      onSelectionChange={(keys) => {
                        const key = new Set(keys).values().next().value as string;
                        void widgetModalStore.loadTemplate(key);
                      }}
                    >
                      {(widget) =>
                        XSelectItem({
                          key: widget.id,
                          textValue: widget.name,
                          children: (
                            <div className="flex w-full gap-2 items-center justify-start">
                              <span>{widget.name}</span>

                              <XChip
                                startContent={
                                  <Avatar
                                    showFallback
                                    className="max-w-4 max-h-4 text-[8px] mr-0.5"
                                    name={`${widget.firstName} ${widget.lastName}`.trim()}
                                    src={widget.avatarUrl ?? undefined}
                                  />
                                }
                                variant="bordered"
                              >
                                {`${widget.firstName} ${widget.lastName}`.trim()}
                              </XChip>
                            </div>
                          ),
                        })
                      }
                    </XSelect>
                  )}

                  <XInput autoFocus isRequired id="name" />

                  <XSelect
                    disallowEmptySelection
                    isRequired
                    id="entityType"
                    items={widgetModalStore.availableEntityTypes.map((entityType) => ({ key: entityType }))}
                  >
                    {({ key }) =>
                      XSelectItem({
                        key,
                        children: t(`Dashboard.entityTypes.${key}`),
                      })
                    }
                  </XSelect>

                  <XSelect
                    disallowEmptySelection
                    isRequired
                    id="aggregationType"
                    items={widgetModalStore.aggregationTypeOptions}
                  >
                    {({ key }) => {
                      const entityTypeName = t(`Dashboard.entityTypes.${form.entityType}`);
                      const translationKey = `Dashboard.aggregationTypes.${key}`;
                      const children =
                        key === "count"
                          ? t(translationKey, { entities: entityTypeName })
                          : key === "dealValue"
                            ? t(translationKey, { entity: entityTypeName })
                            : t(translationKey);
                      return XSelectItem({
                        key,
                        children,
                      });
                    }}
                  </XSelect>

                  <XSelect
                    disallowEmptySelection
                    id="groupByValue"
                    items={widgetModalStore.groupBySelectOptions}
                    value={widgetModalStore.groupBySelectValue}
                    onSelectionChange={(keys) => {
                      const key = new Set(keys).values().next().value as string;
                      widgetModalStore.onGroupByChange(key);
                    }}
                  >
                    {({ key }) => {
                      const opt = widgetModalStore.groupBySelectOptions.find((o) => o.key === key);
                      const translationKey =
                        key.startsWith("custom:") && opt?.label ? undefined : `Dashboard.groupBys.${key}`;
                      return XSelectItem({
                        key,
                        children: translationKey ? t(translationKey as never) : (opt?.label ?? String(key)),
                      });
                    }}
                  </XSelect>

                  <XSwitch id="isTemplate" />
                </div>
              </Tab>

              <Tab
                key="filters"
                title={
                  <div className="flex w-full gap-2 items-center justify-start">
                    <span>
                      {t("Dashboard.tabs.filters", {
                        entityType: t(`Dashboard.entityTypes.${widgetModalStore.form.entityType}`),
                      })}
                    </span>

                    {widgetModalStore.activeFiltersCount > 0 && (
                      <XChip className="h-5 w-5 min-w-5 min-h-5 p-0" color="primary" variant="flat">
                        {widgetModalStore.activeFiltersCount}
                      </XChip>
                    )}
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {widgetModalStore.form.entityFilters?.map((filter, index) => (
                    <XFilterField
                      key={filter.field}
                      baseId={`entityFilters[${index}]`}
                      customColumns={widgetModalStore.customColumns}
                      filter={filter}
                      filterableFields={widgetModalStore.filterableFields}
                    />
                  ))}
                </div>
              </Tab>

              {widgetModalStore.showDealFiltersTab && (
                <Tab
                  key="dealFilters"
                  title={
                    <div className="flex w-full gap-2 items-center justify-start">
                      <span>{t("Dashboard.tabs.dealFilters")}</span>

                      {widgetModalStore.activeDealFiltersCount > 0 && (
                        <XChip className="h-5 w-5 min-w-5 min-h-5 p-0" color="primary" variant="flat">
                          {widgetModalStore.activeDealFiltersCount}
                        </XChip>
                      )}
                    </div>
                  }
                >
                  <div className="flex flex-col gap-4">
                    {widgetModalStore.form.dealFilters?.map((filter, index) => (
                      <XFilterField
                        key={filter.field}
                        baseId={`dealFilters[${index}]`}
                        customColumns={widgetModalStore.customColumnsByEntityType[EntityType.deal]}
                        filter={filter}
                        filterableFields={widgetModalStore.dealFilterableFields}
                      />
                    ))}
                  </div>
                </Tab>
              )}

              <Tab key="display" title={t("Dashboard.tabs.display")}>
                <div className="flex flex-col gap-4">
                  <XSelect
                    disallowEmptySelection
                    isMultiline
                    id="displayOptions.barColors"
                    items={Object.entries(chartColors).map(([key, color]) => ({ key, color }))}
                    renderValue={(items) =>
                      items.map((item) => (
                        <div
                          key={item.key}
                          className="mr-1 inline-flex w-4 h-4 rounded-full"
                          style={{ backgroundColor: item.data?.color }}
                        />
                      ))
                    }
                    selectionMode="multiple"
                  >
                    {({ key, color }) =>
                      XSelectItem({
                        key,
                        textValue: key,
                        children: (
                          <div key={key} className="block w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                        ),
                      })
                    }
                  </XSelect>

                  <XSelect
                    disallowEmptySelection
                    id="displayOptions.displayType"
                    items={Object.values(DisplayType).map((key) => ({ key }))}
                  >
                    {({ key }) =>
                      XSelectItem({
                        key,
                        children: t(`Dashboard.displayTypes.${key}`),
                      })
                    }
                  </XSelect>

                  {form.displayOptions?.displayType !== DisplayType.doughnutChart &&
                    form.displayOptions?.displayType !== DisplayType.radarChart && (
                      <>
                        <XSwitch id="displayOptions.reverseXAxis" />

                        <XSwitch id="displayOptions.reverseYAxis" />
                      </>
                    )}
                </div>
              </Tab>
            </Tabs>
          </XCardBody>

          <XCardModalDefaultFooter store={widgetModalStore} />
        </XCard>
      </XForm>
    </XModal>
  );
});
