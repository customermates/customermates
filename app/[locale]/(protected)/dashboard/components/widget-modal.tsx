"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { EntityType } from "@/generated/prisma";

import { AppModal } from "@/components/modal";
import { AppForm } from "@/components/forms/form-context";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { FormActions } from "@/components/card/form-actions";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormLabel } from "@/components/forms/form-label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDownIcon } from "lucide-react";
import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
import type { ChartColor } from "@/features/widget/widget.types";
import { DisplayType } from "@/features/widget/widget.types";
import { Icon } from "@/components/shared/icon";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
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

  useEffect(() => {
    widgetModalStore.setCustomColumns(customColumns);
    widgetModalStore.setFilterableFields(filterableFields);
  }, [customColumns, filterableFields]);

  return (
    <AppModal store={widgetModalStore} title={t("Dashboard.widget")}>
      <AppForm store={widgetModalStore}>
        <AppCard>
          <AppCardHeader>
            <div className="flex w-full justify-between items-center gap-3">
              <h2 className="text-x-lg">{t("Dashboard.widget")}</h2>

              {canManage && form.id && (
                <Button
                  disabled={isDisabled}
                  size="icon"
                  variant="destructive"
                  onClick={() => showDeleteConfirmation(() => void widgetModalStore.delete())}
                >
                  <Icon icon={Trash2} />
                </Button>
              )}
            </div>
          </AppCardHeader>

          <AppCardBody>
            <Accordion collapsible className="w-full" defaultValue="config" type="single">
              <AccordionItem value="config">
                <AccordionTrigger>{t("Dashboard.tabs.config")}</AccordionTrigger>

                <AccordionContent className="flex flex-col gap-4 pb-4 pt-2">
                  {showTemplateSelection && (
                    <div className="space-y-1.5">
                      <FormLabel htmlFor="template">{t("Common.inputs.template")}</FormLabel>

                      <Select onValueChange={(key) => void widgetModalStore.loadTemplate(key)}>
                        <SelectTrigger className="w-full" id="template">
                          <SelectValue placeholder=" " />
                        </SelectTrigger>

                        <SelectContent>
                          {companyWideWidgets.map((widget) => (
                            <SelectItem key={widget.id} value={widget.id}>
                              <div className="flex w-full gap-2 items-center justify-start">
                                <span>{widget.name}</span>

                                <AppChip variant="outline">
                                  <Avatar className="max-w-4 max-h-4 mr-0.5 size-4">
                                    {widget.avatarUrl && <AvatarImage src={widget.avatarUrl} />}

                                    <AvatarFallback className="text-[8px]">
                                      {`${widget.firstName?.[0] ?? ""}${widget.lastName?.[0] ?? ""}`.toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>

                                  {`${widget.firstName} ${widget.lastName}`.trim()}
                                </AppChip>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <p className="text-x-sm text-muted-foreground">
                        {t("Dashboard.selectWidgetTemplateDescription")}
                      </p>
                    </div>
                  )}

                  <FormInput autoFocus required id="name" label={t("Common.inputs.name")} />

                  <FormSelect
                    required
                    id="entityType"
                    items={widgetModalStore.availableEntityTypes.map((entityType) => ({
                      value: entityType,
                      label: t(`Dashboard.entityTypes.${entityType}`),
                    }))}
                    label={t("Common.inputs.entityType")}
                  />

                  <FormSelect
                    required
                    id="aggregationType"
                    items={widgetModalStore.aggregationTypeOptions.map(({ key }) => {
                      const entityTypeName = t(`Dashboard.entityTypes.${form.entityType}`);
                      const translationKey = `Dashboard.aggregationTypes.${key}`;
                      const label =
                        key === "count"
                          ? t(translationKey, { entities: entityTypeName })
                          : key === "dealValue"
                            ? t(translationKey, { entity: entityTypeName })
                            : t(translationKey);
                      return { value: key, label };
                    })}
                    label={t("Common.inputs.aggregationType")}
                  />

                  <div className="space-y-1.5">
                    <FormLabel htmlFor="groupByValue">{t("Common.inputs.groupByValue")}</FormLabel>

                    <Select
                      value={widgetModalStore.groupBySelectValue}
                      onValueChange={(key) => widgetModalStore.onGroupByChange(key)}
                    >
                      <SelectTrigger className="w-full" id="groupByValue">
                        <SelectValue placeholder=" " />
                      </SelectTrigger>

                      <SelectContent>
                        {widgetModalStore.groupBySelectOptions.map((opt) => {
                          const translationKey =
                            opt.key.startsWith("custom:") && opt.label ? undefined : `Dashboard.groupBys.${opt.key}`;
                          const label = translationKey ? t(translationKey as never) : (opt.label ?? String(opt.key));
                          return (
                            <SelectItem key={opt.key} value={opt.key}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <FormSwitch id="isTemplate" label={t("Common.inputs.isTemplate")} />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="filters">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span>
                      {t("Dashboard.tabs.filters", {
                        entityType: t(`Dashboard.entityTypes.${widgetModalStore.form.entityType}`),
                      })}
                    </span>

                    {widgetModalStore.activeFiltersCount > 0 && (
                      <AppChip className="size-5 min-w-5 min-h-5 p-0" variant="secondary">
                        {widgetModalStore.activeFiltersCount}
                      </AppChip>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-0 pb-2">
                  <FilterAccordion
                    nested
                    baseId="entityFilters"
                    customColumns={widgetModalStore.customColumns}
                    filterableFields={widgetModalStore.filterableFields}
                    filters={widgetModalStore.form.entityFilters ?? []}
                  />
                </AccordionContent>
              </AccordionItem>

              {widgetModalStore.showDealFiltersTab && (
                <AccordionItem value="dealFilters">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <span>{t("Dashboard.tabs.dealFilters")}</span>

                      {widgetModalStore.activeDealFiltersCount > 0 && (
                        <AppChip className="size-5 min-w-5 min-h-5 p-0" variant="secondary">
                          {widgetModalStore.activeDealFiltersCount}
                        </AppChip>
                      )}
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="pt-0 pb-2">
                    <FilterAccordion
                      nested
                      baseId="dealFilters"
                      customColumns={widgetModalStore.customColumnsByEntityType[EntityType.deal]}
                      filterableFields={widgetModalStore.dealFilterableFields}
                      filters={widgetModalStore.form.dealFilters ?? []}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}

              <AccordionItem value="display">
                <AccordionTrigger>{t("Dashboard.tabs.display")}</AccordionTrigger>

                <AccordionContent className="flex flex-col gap-4 pb-4 pt-2">
                  <div className="space-y-1.5">
                    <FormLabel htmlFor="displayOptions.barColors">
                      {t("Common.inputs.displayOptions.barColors")}
                    </FormLabel>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t("Common.inputs.displayOptions.barColors")}
                          className="w-full justify-between font-normal"
                          id="displayOptions.barColors"
                          type="button"
                          variant="outline"
                        >
                          <span className="flex flex-wrap items-center gap-1">
                            {(form.displayOptions?.barColors ?? []).map((key) => (
                              <span
                                key={key}
                                className="inline-flex size-4 rounded-full"
                                style={{ backgroundColor: chartColors[key as keyof typeof chartColors] }}
                              />
                            ))}
                          </span>

                          <ChevronsUpDownIcon className="ml-2 size-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
                        {Object.entries(chartColors).map(([key, color]) => {
                          const selected = (form.displayOptions?.barColors ?? []).includes(key as ChartColor);
                          return (
                            <DropdownMenuCheckboxItem
                              key={key}
                              checked={selected}
                              onCheckedChange={(checked) => {
                                const current = form.displayOptions?.barColors ?? [];
                                const next = checked
                                  ? [...current, key as ChartColor]
                                  : current.filter((k) => k !== (key as ChartColor));
                                if (next.length === 0) return;
                                widgetModalStore.onChange("displayOptions.barColors", next);
                              }}
                              onSelect={(e) => e.preventDefault()}
                            >
                              <span className="inline-flex size-4 rounded-full" style={{ backgroundColor: color }} />
                            </DropdownMenuCheckboxItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <FormSelect
                    id="displayOptions.displayType"
                    items={Object.values(DisplayType).map((key) => ({
                      value: key,
                      label: t(`Dashboard.displayTypes.${key}`),
                    }))}
                    label={t("Common.inputs.displayOptions.displayType")}
                  />

                  {form.displayOptions?.displayType !== DisplayType.doughnutChart &&
                    form.displayOptions?.displayType !== DisplayType.radarChart && (
                      <>
                        <FormSwitch
                          id="displayOptions.reverseXAxis"
                          label={t("Common.inputs.displayOptions.reverseXAxis")}
                        />

                        <FormSwitch
                          id="displayOptions.reverseYAxis"
                          label={t("Common.inputs.displayOptions.reverseYAxis")}
                        />
                      </>
                    )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </AppCardBody>

          <FormActions store={widgetModalStore} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
