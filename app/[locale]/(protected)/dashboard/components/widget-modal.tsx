"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField } from "@/core/base/base-get.schema";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ChevronsUpDownIcon, Trash2 } from "lucide-react";
import { EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";

import { AppModal } from "@/components/modal";
import { AppForm } from "@/components/forms/form-context";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormLabel } from "@/components/forms/form-label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRootStore } from "@/core/stores/root-store.provider";
import type { ChartColor } from "@/features/widget/widget.schema";
import { DisplayType } from "@/features/widget/widget.schema";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { getChartColors } from "@/constants/chart-colors";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { ActivityQueryProvider } from "@/features/messaging/activities/activity-query-context";

import { ActivityFilterFields } from "./activity-filter-fields";
import { WidgetDisplayTypePicker } from "./widget-display-type-picker";
import { WidgetPreview } from "./widget-preview";
import { WidgetStarterPicker } from "./widget-starter-picker";

type Props = {
  customColumns: CustomColumnDto[];
  filterableFields: Record<EntityType, FilterableField[]>;
  activityFilterableFields: FilterableField[];
};

type EditorTab = "data" | "filters" | "appearance";

type WidgetEditActionsProps = {
  anchorScope: string;
  controlsDisabled: boolean;
  hasUnsavedChanges: boolean;
  resetLabel: string;
  saveDisabled: boolean;
  saveLabel: string;
  onReset: () => void;
};

function WidgetEditActions({
  anchorScope,
  controlsDisabled,
  hasUnsavedChanges,
  resetLabel,
  saveDisabled,
  saveLabel,
  onReset,
}: WidgetEditActionsProps) {
  return (
    <>
      {hasUnsavedChanges && (
        <Button
          disabled={controlsDisabled}
          id={`${anchorScope}-reset`}
          type="button"
          variant="outline"
          onClick={onReset}
        >
          {resetLabel}
        </Button>
      )}

      <Button disabled={saveDisabled} id={`${anchorScope}-save`} type="submit">
        {saveLabel}
      </Button>
    </>
  );
}

function WidgetModalSkeleton() {
  const t = useTranslations();

  return (
    <div className="grid min-h-96 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)]" role="status">
      <span className="sr-only">{t("Loading.text")}</span>

      <div className="space-y-4">
        <Skeleton className="h-9 w-full" />

        <Skeleton className="h-24 w-full" />

        <Skeleton className="h-24 w-full" />

        <Skeleton className="h-40 w-full" />
      </div>

      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

function tabForSection(section: string, kind: WidgetKind): EditorTab {
  if (section === "activityFilters") return kind === WidgetKind.activityTimeline ? "data" : "filters";
  if (section === "filters" || section === "dealFilters") return "filters";
  if (section === "display") return "appearance";
  return "data";
}

export const WidgetModal = observer(({ customColumns, filterableFields, activityFilterableFields }: Props) => {
  const t = useTranslations();
  const { plural, singular } = useEntityTerminology();
  const { widgetModalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { resolvedTheme } = useTheme();
  const { form, canManage, isDisabled, isLoading, companyWideWidgets } = widgetModalStore;
  const chartColors = getChartColors(resolvedTheme);
  const isCreate = !form.id;
  const canDeleteWidget = !isCreate && canManage && Boolean(form.id);
  const activeTab = tabForSection(widgetModalStore.expandedSection, form.kind);
  const activeFilterCount =
    form.kind === WidgetKind.chart
      ? widgetModalStore.activeFiltersCount + widgetModalStore.activeDealFiltersCount
      : widgetModalStore.activeTimelineFiltersCount;
  const isChooseStep = isCreate && widgetModalStore.creationStep === "choose";
  const creationStepNumber = isChooseStep ? 1 : 2;
  const dialogTitle = isChooseStep
    ? t("Dashboard.widgetEditor.kind.title")
    : isCreate
      ? t("Dashboard.widgetEditor.addTitle")
      : t("Dashboard.widgetEditor.editTitle", { name: form.name });
  const saveDisabled = isDisabled || !form.name.trim() || (!isCreate && !widgetModalStore.hasUnsavedChanges);

  useEffect(() => {
    widgetModalStore.setCustomColumns(customColumns);
    widgetModalStore.setFilterableFields(filterableFields);
    widgetModalStore.setActivityFilterableFields(activityFilterableFields);
  }, [activityFilterableFields, customColumns, filterableFields, widgetModalStore]);

  function requestClose() {
    if (isLoading) return;
    if (widgetModalStore.withUnsavedChangesGuard && widgetModalStore.hasUnsavedChanges) {
      widgetModalStore.setIsClosingWithGuard(true);
      return;
    }
    widgetModalStore.close();
  }

  function setActiveTab(next: string) {
    if (next === "filters") {
      widgetModalStore.setExpandedSection(form.kind === WidgetKind.chart ? "filters" : "activityFilters");
      return;
    }
    widgetModalStore.setExpandedSection(next === "appearance" ? "display" : "config");
  }

  function goBackToKindStep() {
    const selectedKind = form.kind;
    widgetModalStore.setCreationStep("choose");
    requestAnimationFrame(() => document.getElementById(`widget-kind-${selectedKind}`)?.focus());
  }

  function renderChartData() {
    if (form.kind !== WidgetKind.chart) return null;

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect
          required
          id="entityType"
          items={widgetModalStore.availableEntityTypes.map((entityType) => ({
            value: entityType,
            label: singular(entityType),
          }))}
          label={t("Common.inputs.entityType")}
        />

        <FormSelect
          required
          id="aggregationType"
          items={widgetModalStore.aggregationTypeOptions.map(({ key }) => {
            const translationKey = `Dashboard.aggregationTypes.${key}`;
            const label =
              key === "count"
                ? t(translationKey, { entities: plural(form.entityType) })
                : key === "dealValue"
                  ? form.entityType === EntityType.deal
                    ? t("Dashboard.aggregationTypes.dealValue", {
                        deal: singular(EntityType.deal),
                      })
                    : t("Dashboard.aggregationTypes.dealValueRelated", {
                        deal: singular(EntityType.deal),
                        entity: singular(form.entityType),
                      })
                  : key === "dealQuantity"
                    ? t(translationKey, {
                        deals: plural(EntityType.deal),
                        services: plural(EntityType.service),
                      })
                    : t(translationKey);
            return { value: key, label };
          })}
          label={t("Common.inputs.aggregationType")}
        />

        <div className="space-y-1.5 sm:col-span-2">
          <FormLabel htmlFor="groupByValue">{t("Common.inputs.groupByValue")}</FormLabel>

          <Select
            disabled={isDisabled}
            value={widgetModalStore.groupBySelectValue}
            onValueChange={widgetModalStore.onGroupByChange}
          >
            <SelectTrigger className="w-full" id="groupByValue">
              <SelectValue placeholder=" " />
            </SelectTrigger>

            <SelectContent>
              {widgetModalStore.groupBySelectOptions.map((option) => {
                const isEntityGrouping = Object.values(EntityType).includes(option.key as EntityType);
                const label = isEntityGrouping
                  ? singular(option.key as EntityType)
                  : option.key.startsWith("custom:") && option.label
                    ? option.label
                    : t("Dashboard.groupBys.none");
                return (
                  <SelectItem key={option.key} value={option.key}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  function renderDataSettings() {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <FormInput required id="name" label={t("Common.inputs.name")} />

        {form.kind === WidgetKind.chart ? (
          renderChartData()
        ) : (
          <ActivityQueryProvider filters={form.timelineFilters}>
            <ActivityFilterFields
              expandedField={
                widgetModalStore.expandedSection === "activityFilters"
                  ? widgetModalStore.expandedFilterField
                  : undefined
              }
              filterableFields={widgetModalStore.activityFilterableFields}
              filters={form.timelineFilters ?? []}
              onConnectedAccountChange={widgetModalStore.clearActivityThreadFilter}
              onExpandedFieldChange={(field) => {
                widgetModalStore.setExpandedSection("activityFilters");
                widgetModalStore.setExpandedFilterField(field || undefined);
              }}
            />
          </ActivityQueryProvider>
        )}
      </div>
    );
  }

  function renderChartFilters() {
    if (form.kind !== WidgetKind.chart) return null;

    return (
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="widget-entity-filters-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium" id="widget-entity-filters-heading">
              {t("Dashboard.tabs.filters", {
                entityType: singular(form.entityType),
              })}
            </h4>

            <Badge variant="secondary">{widgetModalStore.activeFiltersCount}</Badge>
          </div>

          <FilterAccordion
            baseId="entityFilters"
            customColumns={widgetModalStore.customColumns}
            filterableFields={widgetModalStore.filterableFields}
            filters={form.entityFilters ?? []}
            value={widgetModalStore.expandedSection === "filters" ? (widgetModalStore.expandedFilterField ?? "") : ""}
            variant="grouped"
            onValueChange={(field) => {
              widgetModalStore.setExpandedSection("filters");
              widgetModalStore.setExpandedFilterField(field);
            }}
          />
        </section>

        {widgetModalStore.showDealFiltersTab && (
          <section aria-labelledby="deal-widget-filters-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium" id="deal-widget-filters-heading">
                {t("Dashboard.tabs.dealFilters", { deals: plural(EntityType.deal) })}
              </h4>

              <Badge variant="secondary">{widgetModalStore.activeDealFiltersCount}</Badge>
            </div>

            <FilterAccordion
              baseId="dealFilters"
              customColumns={widgetModalStore.customColumnsByEntityType[EntityType.deal]}
              filterableFields={widgetModalStore.dealFilterableFields}
              filters={form.dealFilters ?? []}
              value={
                widgetModalStore.expandedSection === "dealFilters" ? (widgetModalStore.expandedFilterField ?? "") : ""
              }
              variant="grouped"
              onValueChange={(field) => {
                widgetModalStore.setExpandedSection("dealFilters");
                widgetModalStore.setExpandedFilterField(field);
              }}
            />
          </section>
        )}
      </div>
    );
  }

  function renderFilterSettings() {
    return renderChartFilters();
  }

  function renderColorPicker() {
    if (form.kind !== WidgetKind.chart) return null;
    if (form.groupByType === WidgetGroupByType.customColumn && form.displayOptions?.useGroupColors !== false)
      return null;

    return (
      <div className="space-y-1.5">
        <FormLabel htmlFor="displayOptions.barColors">{t("Dashboard.widgetEditor.appearance.colors")}</FormLabel>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("Dashboard.widgetEditor.appearance.colors")}
              className="w-full justify-between border-input bg-input-background font-normal shadow-xs"
              disabled={isDisabled}
              id="displayOptions.barColors"
              type="button"
              variant="outline"
            >
              <span className="flex flex-wrap items-center gap-1">
                {(form.displayOptions?.barColors ?? []).map((key) => (
                  <span
                    key={key}
                    className="inline-flex size-4 rounded-full"
                    style={{
                      backgroundColor: chartColors[key as keyof typeof chartColors],
                    }}
                  />
                ))}
              </span>

              <ChevronsUpDownIcon className="ml-2 size-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)">
            {Object.entries(chartColors).map(([key, color], index) => {
              const selected = (form.displayOptions?.barColors ?? []).includes(key as ChartColor);
              const label = t("Dashboard.widgetEditor.appearance.colorOption", { number: index + 1 });
              return (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={selected}
                  disabled={isDisabled}
                  onCheckedChange={(checked) => {
                    const current = form.displayOptions?.barColors ?? [];
                    const next = checked
                      ? [...current, key as ChartColor]
                      : current.filter((colorKey) => colorKey !== (key as ChartColor));
                    if (next.length === 0) return;
                    widgetModalStore.onChange("displayOptions.barColors", next);
                  }}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="inline-flex size-4 rounded-full" style={{ backgroundColor: color }} />

                  <span>{label}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  function renderChartAppearance() {
    if (form.kind !== WidgetKind.chart) return null;
    const displayType = form.displayOptions?.displayType ?? DisplayType.verticalBarChart;
    const supportsAxes = displayType !== DisplayType.doughnutChart && displayType !== DisplayType.radarChart;

    return (
      <div className="flex min-w-0 flex-col gap-4">
        <WidgetDisplayTypePicker
          disabled={isDisabled}
          value={displayType}
          onValueChange={(next) => widgetModalStore.onChange("displayOptions.displayType", next)}
        />

        {form.groupByType === WidgetGroupByType.customColumn && (
          <FormSwitch id="displayOptions.useGroupColors" label={t("Common.inputs.displayOptions.useGroupColors")} />
        )}

        {renderColorPicker()}

        {displayType === DisplayType.doughnutChart && (
          <FormSwitch id="displayOptions.showLegend" label={t("Common.inputs.displayOptions.showLegend")} />
        )}

        {supportsAxes && (
          <>
            <FormSwitch id="displayOptions.reverseXAxis" label={t("Common.inputs.displayOptions.reverseXAxis")} />

            <FormSwitch id="displayOptions.reverseYAxis" label={t("Common.inputs.displayOptions.reverseYAxis")} />
          </>
        )}
      </div>
    );
  }

  function renderAppearanceSettings() {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {renderChartAppearance()}

        <FormSwitch
          id="displayOptions.showFilters"
          label={
            form.kind === WidgetKind.chart
              ? t("Dashboard.widgetEditor.appearance.showMetricAndFilters")
              : t("Dashboard.widgetEditor.appearance.showFilters")
          }
        />

        <FormSwitch id="isTemplate" label={t("Dashboard.widgetEditor.sharing.template")} />
      </div>
    );
  }

  return (
    <AppModal
      actions={
        canDeleteWidget
          ? [
              {
                id: "delete-widget",
                label: t("Dashboard.widgetEditor.danger.deleteLabel", { name: form.name }),
                icon: Trash2,
                variant: "destructive",
                disabled: isDisabled,
                onClick: () => showDeleteConfirmation(() => void widgetModalStore.delete(), form.name),
              },
            ]
          : []
      }
      description={
        isCreate && widgetModalStore.creationStep === "choose"
          ? t("Dashboard.widgetEditor.steps.chooseDescription")
          : t("Dashboard.widgetEditor.steps.configureDescription")
      }
      size={isChooseStep ? "3xl" : "5xl"}
      store={widgetModalStore}
      title={dialogTitle}
    >
      <AppForm store={widgetModalStore}>
        <AppCard>
          <AppCardHeader className="flex-col items-start gap-4">
            <div className="flex w-full min-w-0 items-start gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                {isCreate && (
                  <p className="text-xs text-muted-foreground">
                    {t("Dashboard.widgetEditor.progress", {
                      current: creationStepNumber,
                      total: 2,
                    })}
                  </p>
                )}

                <h2 className="min-w-0 break-words text-xl font-semibold">{dialogTitle}</h2>
              </div>
            </div>

            {isCreate && (
              <div
                aria-label={t("Dashboard.widgetEditor.progressLabel")}
                aria-valuemax={2}
                aria-valuemin={1}
                aria-valuenow={creationStepNumber}
                aria-valuetext={t("Dashboard.widgetEditor.progress", {
                  current: creationStepNumber,
                  total: 2,
                })}
                className="h-1 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <div
                  className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                  style={{
                    width: `${(creationStepNumber / 2) * 100}%`,
                  }}
                />
              </div>
            )}
          </AppCardHeader>

          <AppCardBody className={isChooseStep ? "md:flex-none" : "md:min-h-96"}>
            {widgetModalStore.isHydrating ? (
              <WidgetModalSkeleton />
            ) : isChooseStep ? (
              <div className="mx-auto w-full max-w-3xl">
                <WidgetStarterPicker
                  availableKinds={widgetModalStore.availableKinds}
                  disabled={isDisabled}
                  templates={companyWideWidgets}
                  onSelectKind={(kind) => widgetModalStore.startFromKind(kind, t("Dashboard.activityWidget.title"))}
                  onSelectTemplate={(id) => void widgetModalStore.loadTemplate(id)}
                />
              </div>
            ) : (
              <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)]">
                <Tabs className="min-w-0" value={activeTab} onValueChange={setActiveTab}>
                  <TabsList
                    aria-label={t("Dashboard.widgetEditor.tabs.label")}
                    className={form.kind === WidgetKind.chart ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}
                    variant="segmented"
                  >
                    <TabsTrigger disabled={isDisabled} id="widget-tab-data" value="data">
                      {t("Dashboard.widgetEditor.tabs.data")}
                    </TabsTrigger>

                    {form.kind === WidgetKind.chart && (
                      <TabsTrigger
                        aria-label={t("Dashboard.widgetEditor.tabs.filtersLabel", { count: activeFilterCount })}
                        disabled={isDisabled}
                        id="widget-tab-filters"
                        value="filters"
                      >
                        {t("Dashboard.widgetEditor.tabs.filters")}

                        {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
                      </TabsTrigger>
                    )}

                    <TabsTrigger disabled={isDisabled} id="widget-tab-appearance" value="appearance">
                      {t("Dashboard.widgetEditor.tabs.appearance")}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent className="pt-5" value="data">
                    {renderDataSettings()}
                  </TabsContent>

                  {form.kind === WidgetKind.chart && (
                    <TabsContent className="pt-5" value="filters">
                      {renderFilterSettings()}
                    </TabsContent>
                  )}

                  <TabsContent className="pt-5" value="appearance">
                    {renderAppearanceSettings()}
                  </TabsContent>
                </Tabs>

                <WidgetPreview
                  activeFilterCount={activeFilterCount}
                  activityFilters={widgetModalStore.previewTimelineFilters}
                  customColumns={widgetModalStore.customColumns}
                  form={form}
                />
              </div>
            )}
          </AppCardBody>

          <AppCardFooter className="gap-2">
            <Button disabled={isLoading} type="button" variant="ghost" onClick={requestClose}>
              {t("Common.actions.cancel")}
            </Button>

            {isCreate && widgetModalStore.creationStep === "configure" ? (
              <>
                <Button disabled={isDisabled} type="button" variant="outline" onClick={goBackToKindStep}>
                  {t("Common.actions.back")}
                </Button>

                <Button disabled={saveDisabled} id="widget-modal-save" type="submit">
                  {t("Dashboard.widgetEditor.create")}
                </Button>
              </>
            ) : !isCreate && canManage ? (
              <WidgetEditActions
                anchorScope="widget-modal"
                controlsDisabled={isDisabled}
                hasUnsavedChanges={widgetModalStore.hasUnsavedChanges}
                resetLabel={t("Common.actions.reset")}
                saveDisabled={saveDisabled}
                saveLabel={t("Dashboard.widgetEditor.save")}
                onReset={widgetModalStore.resetForm}
              />
            ) : null}
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
