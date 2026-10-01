"use client";

import { RecordActivityWidgetEditor } from "./record-activity-widget-editor";

import { WidgetKind } from "@/generated/prisma";
import { ChevronsUpDownIcon, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormActions } from "@/components/card/form-actions";
import { AppForm } from "@/components/forms/form-context";
import { FormLabel } from "@/components/forms/form-label";
import { FormInput } from "@/components/forms/form-input";
import { FormSwitch } from "@/components/forms/form-switch";
import { AppModal } from "@/components/modal";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getChartColors } from "@/constants/chart-colors";
import { useRootStore } from "@/core/stores/root-store.provider";
import type { ChartColor } from "@/features/widget/widget.schema";
import { DisplayType } from "@/features/widget/widget.schema";

import { WizardProgress } from "@/components/shared/wizard-progress";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordWidgetEditor } from "./record-widget-editor";
import { isRecordActivityWidgetForm, isRecordWidgetForm } from "./record-widget-form";
import { WidgetDisplayTypePicker } from "./widget-display-type-picker";
import { WIDGET_EDITOR_GRID_CLASS } from "./widget-editor-layout";
import { WidgetStarterPicker } from "./widget-starter-picker";

type EditorTab = "data" | "filters" | "appearance";

function WidgetModalSkeleton() {
  const t = useTranslations();

  return (
    <div className={`${WIDGET_EDITOR_GRID_CLASS} min-h-96`} role="status">
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

export const WidgetModal = observer(() => {
  const t = useTranslations();
  const { widgetModalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { resolvedTheme } = useTheme();
  const { form, canManage, isDisabled, companyWideWidgets } = widgetModalStore;
  const chartColors = getChartColors(resolvedTheme);
  const isCreate = !form.id;
  const canDeleteWidget = !isCreate && canManage && Boolean(form.id);
  const activeTab = tabForSection(widgetModalStore.expandedSection, form.kind);
  const activeFilterCount =
    form.kind === WidgetKind.chart
      ? isRecordWidgetForm(form)
        ? form.measure.source.filters.length +
          form.measure.source.relationships.length +
          (form.measure.source.relatedFilters?.length ?? 0) +
          (form.measure.groupBy?.filter?.filters?.length ?? 0) +
          (form.measure.groupBy?.filter?.relationships?.length ?? 0) +
          (form.measure.groupBy?.filter?.relatedFilters?.length ?? 0) +
          Number(Boolean(form.measure.groupBy?.filter?.search))
        : 0
      : widgetModalStore.activeTimelineFiltersCount;
  const isChooseStep = isCreate && widgetModalStore.creationStep === "choose";
  const creationStepNumber = isChooseStep ? 1 : 2;
  const progressText = t("Dashboard.widgetEditor.progress", {
    current: creationStepNumber,
    total: 2,
  });
  const dialogTitle = isChooseStep
    ? t("Dashboard.widgetEditor.kind.title")
    : isCreate
      ? t("Dashboard.widgetEditor.addTitle")
      : t("Dashboard.widgetEditor.editTitle", { name: form.name });
  const saveDisabled = isDisabled || !form.name.trim() || (!isCreate && !widgetModalStore.hasUnsavedChanges);

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
    return form.kind === WidgetKind.chart ? <RecordWidgetEditor section="data" store={widgetModalStore} /> : null;
  }

  function renderDataSettings() {
    return form.kind === WidgetKind.chart ? (
      renderChartData()
    ) : (
      <RecordActivityWidgetEditor section="data" store={widgetModalStore} />
    );
  }
  function renderChartFilters() {
    return form.kind === WidgetKind.chart ? <RecordWidgetEditor section="filters" store={widgetModalStore} /> : null;
  }

  function renderColorPicker() {
    if (form.kind !== WidgetKind.chart) return null;
    if (Boolean(form.measure.groupBy?.fieldId) && form.displayOptions?.useGroupColors !== false) return null;

    return (
      <div className="space-y-1.5">
        <FormLabel htmlFor="displayOptions.barColors">{t("Dashboard.widgetEditor.appearance.colors")}</FormLabel>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("Dashboard.widgetEditor.appearance.colors")}
              className="w-full justify-between font-normal"
              disabled={isDisabled}
              id="displayOptions.barColors"
              type="button"
              variant="field"
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

          <DropdownMenuContent
            align="start"
            aria-labelledby="displayOptions.barColors"
            className="w-(--radix-dropdown-menu-trigger-width)"
          >
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

        {Boolean(form.measure.groupBy?.fieldId) && (
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
                label: t("Dashboard.widgetEditor.danger.deleteLabel", {
                  name: form.name,
                }),
                icon: Trash2,
                variant: "destructive",
                disabled: isDisabled,
                onClick: () => showDeleteConfirmation(() => widgetModalStore.delete(), form.name),
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
            <div className="min-w-0 flex-1 space-y-1">
              {isCreate && <p className="text-xs text-muted-foreground">{progressText}</p>}

              <h2 className="min-w-0 break-words text-xl font-semibold">{dialogTitle}</h2>
            </div>

            {isCreate && (
              <WizardProgress
                current={creationStepNumber}
                label={t("Dashboard.widgetEditor.progressLabel")}
                total={2}
                valueText={progressText}
              />
            )}
          </AppCardHeader>

          <AppCardBody className={isChooseStep ? "md:flex-initial" : "md:min-h-96"}>
            {widgetModalStore.isHydrating ? (
              <WidgetModalSkeleton />
            ) : isChooseStep ? (
              <div className="mx-auto w-full max-w-3xl">
                <WidgetStarterPicker
                  availableKinds={widgetModalStore.availableKinds}
                  disabled={isDisabled}
                  templates={companyWideWidgets}
                  onSelectKind={(kind) => widgetModalStore.startFromKind(kind, t("Dashboard.activityWidget.title"))}
                  onSelectTemplate={(id) => runUserAction(() => widgetModalStore.loadTemplate(id))}
                />
              </div>
            ) : (
              <div className={WIDGET_EDITOR_GRID_CLASS}>
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

                  <TabsContent aria-labelledby="widget-tab-data" className="pt-5" value="data">
                    <div className="mb-4">
                      <FormInput id="name" label={t("Common.inputs.name")} />
                    </div>

                    {renderDataSettings()}
                  </TabsContent>

                  {form.kind === WidgetKind.chart && (
                    <TabsContent aria-labelledby="widget-tab-filters" className="pt-5" value="filters">
                      {renderChartFilters()}
                    </TabsContent>
                  )}

                  <TabsContent aria-labelledby="widget-tab-appearance" className="pt-5" value="appearance">
                    {renderAppearanceSettings()}
                  </TabsContent>
                </Tabs>

                {isRecordActivityWidgetForm(form) ? (
                  <RecordActivityWidgetEditor section="preview" store={widgetModalStore} />
                ) : isRecordWidgetForm(form) ? (
                  <RecordWidgetEditor section="preview" store={widgetModalStore} />
                ) : null}
              </div>
            )}
          </AppCardBody>

          {isCreate ? (
            widgetModalStore.creationStep === "configure" && (
              <AppCardFooter className="gap-2">
                <Button disabled={isDisabled} type="button" variant="secondary" onClick={goBackToKindStep}>
                  {t("Common.actions.back")}
                </Button>

                <Button disabled={saveDisabled} id="widget-modal-save" type="submit">
                  {t("Dashboard.widgetEditor.create")}
                </Button>
              </AppCardFooter>
            )
          ) : (
            <FormActions
              showInitially
              anchorScope="widget-modal"
              overrideDisabled={!form.name.trim()}
              primaryButtonLabel="Dashboard.widgetEditor.save"
              store={widgetModalStore}
            />
          )}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
