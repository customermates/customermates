"use client";

import { useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getChartColors } from "@/constants/chart-colors";
import { useRootStore } from "@/core/stores/root-store.provider";
import type { ChartColor } from "@/features/widget/widget.schema";
import { DisplayType } from "@/features/widget/widget.schema";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { WidgetDisplayRequirement } from "@/features/widget/widget-display-rules";
import { widgetDisplayTypeIssue } from "@/features/widget/widget-display-rules";

import { runUserAction } from "@/core/errors/report-application-error";
import { RecordWidgetEditor } from "./record-widget-editor";
import { WidgetDisplayTypePicker } from "./widget-display-type-picker";
import { WIDGET_EDITOR_GRID_CLASS } from "./widget-editor-layout";
import { WidgetStarterPicker } from "./widget-starter-picker";

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

export const WidgetModal = observer(() => {
  const t = useTranslations();
  const { widgetModalStore } = useRootStore();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const { resolvedTheme } = useTheme();
  const { form, canManage, isDisabled, companyWideWidgets } = widgetModalStore;
  const chartColors = getChartColors(resolvedTheme);
  const isCreate = !form.id;
  const canDeleteWidget = !isCreate && canManage && Boolean(form.id);
  const isChooseStep = isCreate && widgetModalStore.creationStep === "choose";
  const dialogTitle = isChooseStep
    ? t("Dashboard.widgetEditor.kind.title")
    : isCreate
      ? t("Dashboard.widgetEditor.addTitle")
      : t("Dashboard.widgetEditor.editTitle", { name: form.name });
  const saveDisabled = isDisabled || !form.name.trim() || (!isCreate && !widgetModalStore.hasUnsavedChanges);

  useEffect(() => {
    if (
      !widgetModalStore.isOpen ||
      widgetModalStore.isHydrating ||
      isChooseStep ||
      widgetModalStore.expandedSection === "config"
    )
      return;
    const frame = requestAnimationFrame(() => {
      const id = widgetModalStore.expandedSection === "display" ? "widget-config-appearance" : "widget-config-filters";
      const section = document.getElementById(id);
      section?.scrollIntoView({ block: "start" });
      section?.querySelector<HTMLElement>("input, button, [tabindex='0']")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    widgetModalStore,
    widgetModalStore.isOpen,
    widgetModalStore.isHydrating,
    widgetModalStore.expandedSection,
    isChooseStep,
  ]);

  function goBackToKindStep() {
    const selectedKind = form.kind;
    widgetModalStore.setCreationStep("choose");
    requestAnimationFrame(() => document.getElementById(`widget-kind-${selectedKind}`)?.focus());
  }
  function renderDataSettings() {
    const appearance = (model?: RecordModel | null) => (
      <section
        aria-label={t("Dashboard.widgetEditor.tabs.appearance")}
        className="space-y-4"
        id="widget-config-appearance"
      >
        <h3 className="text-sm font-medium">{t("Dashboard.widgetEditor.tabs.appearance")}</h3>

        {renderAppearanceSettings(model)}
      </section>
    );
    const nameField = <FormInput id="name" label={t("Common.inputs.name")} />;
    return form.kind === WidgetKind.chart ? (
      <RecordWidgetEditor appearance={appearance} section="all" settingsHeader={nameField} store={widgetModalStore} />
    ) : (
      <RecordActivityWidgetEditor
        appearance={appearance()}
        section="all"
        settingsHeader={nameField}
        store={widgetModalStore}
      />
    );
  }

  function groupColorsApply() {
    if (form.kind !== WidgetKind.chart) return false;
    const displayType = form.displayOptions?.displayType ?? DisplayType.verticalBarChart;
    return (
      Boolean(form.measure.groupBy?.fieldId) &&
      !form.measure.groupBy?.dateInterval &&
      ![DisplayType.number, DisplayType.areaChart, DisplayType.rankedTable].includes(displayType)
    );
  }
  function renderColorPicker() {
    if (form.kind !== WidgetKind.chart) return null;
    if (form.displayOptions?.displayType === DisplayType.number) return null;
    if (groupColorsApply() && form.displayOptions?.useGroupColors !== false) return null;

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

  function renderChartAppearance(model?: RecordModel | null) {
    if (form.kind !== WidgetKind.chart) return null;
    const measure = form.measure;
    const displayType = form.displayOptions?.displayType ?? DisplayType.verticalBarChart;
    const supportsAxes = ![
      DisplayType.doughnutChart,
      DisplayType.radarChart,
      DisplayType.number,
      DisplayType.rankedTable,
      DisplayType.funnelChart,
    ].includes(displayType);
    const unavailable: Partial<Record<DisplayType, WidgetDisplayRequirement>> = {};
    for (const type of Object.values(DisplayType)) {
      const requirement = widgetDisplayTypeIssue(type, measure, model);
      if (requirement) unavailable[type] = requirement;
    }

    return (
      <div className="flex min-w-0 flex-col gap-4">
        <WidgetDisplayTypePicker
          disabled={isDisabled}
          unavailable={unavailable}
          value={displayType}
          onValueChange={(next) => widgetModalStore.onChange("displayOptions.displayType", next)}
        />

        {groupColorsApply() && (
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

  function renderAppearanceSettings(model?: RecordModel | null) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {renderChartAppearance(model)}

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
          <AppCardHeader>
            <h2 className="min-w-0 break-words text-base font-semibold">{dialogTitle}</h2>
          </AppCardHeader>

          <AppCardBody className={isChooseStep ? "md:flex-initial" : "md:min-h-96"}>
            {widgetModalStore.isHydrating ? (
              <WidgetModalSkeleton />
            ) : isChooseStep ? (
              <div className="mx-auto w-full max-w-3xl">
                <WidgetStarterPicker
                  availableKinds={widgetModalStore.availableKinds}
                  disabled={isDisabled}
                  gallery={widgetModalStore.galleryTemplates}
                  templates={companyWideWidgets}
                  typeLabel={(typeId) =>
                    widgetModalStore.recordTypes?.types.find((type) => type.id === typeId)?.pluralLabel
                  }
                  onSelectGalleryTemplate={(template) =>
                    widgetModalStore.startFromGallery(
                      template,
                      t(`Dashboard.widgetGallery.templates.${template.key}.name`),
                    )
                  }
                  onSelectKind={(kind) => widgetModalStore.startFromKind(kind, t("Dashboard.activityWidget.title"))}
                  onSelectTemplate={(id) => runUserAction(() => widgetModalStore.loadTemplate(id))}
                />
              </div>
            ) : (
              renderDataSettings()
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
