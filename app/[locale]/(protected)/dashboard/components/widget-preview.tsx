"use client";

import type { WidgetModalForm } from "./widget-modal.store";
import { isCurrencyAggregation } from "@/features/widget/widget-aggregation";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { ReactNode } from "react";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { WidgetKind } from "@/generated/prisma";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { DisplayType } from "@/features/widget/widget.schema";
import { ActivitiesList } from "@/features/messaging/activities/activities-list";
import { useOwnedActivitiesStore } from "@/features/messaging/activities/use-owned-activities-store";

import { useAggregationTypeLabel } from "./use-aggregation-type-label";
import { WidgetChart } from "./widget-chart";
import { buildChartPreviewData, getChartPreviewTotal } from "./widget-preview-data";
import { widgetSubheader } from "./widget-subheader";
import { resolveResourcePageState } from "@/components/page-state/resource-page-state";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";

const ACTIVITY_PREVIEW_PAGE_SIZE = 5;
const ACTIVITY_PREVIEW_DEBOUNCE_MS = 400;

type Props = {
  activeFilterCount: number;
  activityFilters: Filter[];
  customColumns: CustomColumnDto[];
  form: WidgetModalForm;
};

function WidgetPreviewFrame({
  children,
  screenReaderSummary,
  summary,
  title,
}: {
  children: ReactNode;
  screenReaderSummary: ReactNode;
  summary?: ReactNode;
  title: string;
}) {
  const t = useTranslations();

  return (
    <section aria-labelledby="widget-preview-heading" className="min-w-0 lg:sticky lg:top-0">
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-x-md truncate text-foreground" id="widget-preview-heading">
              {title}
            </h3>

            {summary}
          </div>

          <Badge className="shrink-0" variant="secondary">
            {t("Dashboard.widgetEditor.preview.title")}
          </Badge>
        </div>

        {children}
      </div>

      <p className="sr-only">{screenReaderSummary}</p>
    </section>
  );
}

const ActivityPreviewFeed = observer(({ filters }: { filters: Filter[] }) => {
  const t = useTranslations();
  const store = useOwnedActivitiesStore({ pageSize: ACTIVITY_PREVIEW_PAGE_SIZE });
  const filterKey = useDebouncedValue(JSON.stringify(filters), ACTIVITY_PREVIEW_DEBOUNCE_MS);

  useEffect(() => {
    void store.applyFilters(JSON.parse(filterKey) as Filter[]).catch(() => undefined);
  }, [filterKey, store]);

  const previewState = resolveResourcePageState(store.dataRequest, store.items.length);

  let body: ReactNode;
  switch (previewState) {
    case "loading":
      body = (
        <div aria-hidden className="flex min-h-40 items-center justify-center py-2">
          <Spinner aria-label={t("Loading.text")} className="size-4 text-muted-foreground" />
        </div>
      );
      break;
    case "error":
      body = (
        <div aria-hidden className="flex min-h-40 items-center justify-center py-2">
          <p className="text-center text-xs text-muted-foreground">{t("Dashboard.activityWidget.error")}</p>
        </div>
      );
      break;
    case "true-empty":
      body = (
        <div aria-hidden className="flex min-h-40 items-center justify-center py-2">
          <p className="text-center text-xs text-muted-foreground">{t("Dashboard.activityWidget.noMatches")}</p>
        </div>
      );
      break;
    case "content":
      body = (
        <div aria-hidden inert className="pointer-events-none min-h-40 py-2">
          <ActivitiesList
            customColumns={store.customColumns}
            hasMore={false}
            items={store.items}
            loading={false}
            onLoadOlder={() => undefined}
          />
        </div>
      );
      break;
    default: {
      const exhaustive: never = previewState;
      body = exhaustive;
    }
  }

  return body;
});

export const WidgetPreview = observer(({ activeFilterCount, activityFilters, customColumns, form }: Props) => {
  const t = useTranslations();
  const aggregationTypeLabel = useAggregationTypeLabel();
  const intlStore = useHydratedIntlStore();
  const title = form.name.trim() || t("Dashboard.widgetEditor.preview.untitled");
  const showSummary = form.displayOptions?.showFilters !== false;

  if (form.kind === WidgetKind.chart) {
    const displayType = form.displayOptions?.displayType ?? DisplayType.verticalBarChart;
    const previewData = buildChartPreviewData({
      aggregationType: form.aggregationType,
      customColumns,
      fallbackLabels: [1, 2, 3].map((number) =>
        t("Dashboard.widgetEditor.preview.groupLabel", {
          number,
        }),
      ),
      groupByCustomColumnId: form.groupByCustomColumnId,
      groupByType: form.groupByType,
    });
    const previewTotal = getChartPreviewTotal(form.aggregationType);
    const formattedTotal = isCurrencyAggregation(form.aggregationType)
      ? intlStore.formatCurrency(previewTotal, undefined, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      : intlStore.formatNumber(previewTotal);
    const previewSummary = widgetSubheader(previewData.length, formattedTotal, t("Diagrams.groups")) ?? formattedTotal;
    const metric = aggregationTypeLabel(form.aggregationType, form.entityType);

    return (
      <WidgetPreviewFrame
        screenReaderSummary={t("Dashboard.widgetEditor.preview.chartSummary", {
          chart: t(`Dashboard.displayTypes.${displayType}`),
          metric,
          summary: previewSummary,
          title,
        })}
        summary={
          showSummary ? (
            <p className="text-xs text-muted-foreground">
              {previewSummary}

              {activeFilterCount > 0 && (
                <>
                  <span aria-hidden className="mx-1 opacity-40">
                    ·
                  </span>

                  {t("Dashboard.widgetEditor.preview.filterSummary", {
                    count: activeFilterCount,
                  })}
                </>
              )}
            </p>
          ) : undefined
        }
        title={title}
      >
        <div aria-hidden inert className="pointer-events-none mt-4 h-52 min-h-0 overflow-hidden">
          <WidgetChart aggregationType={form.aggregationType} data={previewData} displayOptions={form.displayOptions} />
        </div>
      </WidgetPreviewFrame>
    );
  }

  return (
    <WidgetPreviewFrame
      screenReaderSummary={
        <>
          {t("Dashboard.widgetEditor.preview.activitySummary", {
            filters: activeFilterCount,
            title,
          })}
        </>
      }
      summary={
        showSummary && activeFilterCount > 0 ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {t("Dashboard.widgetEditor.preview.filterSummary", {
              count: activeFilterCount,
            })}
          </p>
        ) : undefined
      }
      title={title}
    >
      <ActivityPreviewFeed filters={activityFilters} />
    </WidgetPreviewFrame>
  );
});
