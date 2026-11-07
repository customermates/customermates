"use client";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { PublicChartWidget } from "@/features/public-link/public-link.schema";
import type { RecordContributionGroup } from "@/features/records/record-contribution.schema";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { PageState } from "@/components/page-state/page-state";
import { ScopedRecordsTable } from "@/components/records/scoped-records-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { DisplayType } from "@/features/widget/widget-display.schema";
import { RecordWidgetChart } from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/record-widget-chart";

import { readPublicWidgetRecordsAction } from "./actions";
import { PublicRecordExplorationStore } from "./public-record-exploration.store";

export type PublicWidgetSelection = {
  widget: number;
  chart: PublicChartWidget;
  group: RecordContributionGroup | null;
  label: string | null;
  opener: HTMLElement | null;
};

type Props = {
  token: string;
  selection: PublicWidgetSelection;
  open: boolean;
  onClose: () => void;
  onSelect: (group: RecordContributionGroup | null, label: string | null) => void;
};

export const PublicWidgetDrawer = observer(function PublicWidgetDrawer({
  token,
  selection,
  open,
  onClose,
  onSelect,
}: Props) {
  const t = useTranslations();
  const root = useRootStore();
  const [store, setStore] = useState<PublicRecordExplorationStore | null>(null);
  const [failure, setFailure] = useState<"unavailable" | "rateLimited" | null>(null);

  const request = useMemo(
    () => (params?: GetQueryParams) =>
      readPublicWidgetRecordsAction({
        token,
        widget: selection.widget,
        group: selection.group,
        label: selection.label,
        page: params?.page ?? params?.pagination?.page ?? 1,
        ...((params?.pageSize ?? params?.pagination?.pageSize)
          ? { pageSize: params?.pageSize ?? params?.pagination?.pageSize }
          : {}),
        ...(params?.sortDescriptor ? { sortDescriptor: params.sortDescriptor } : {}),
      }),
    [token, selection],
  );

  useEffect(() => {
    let active = true;
    setStore(null);
    setFailure(null);
    const load = async (params?: GetQueryParams) => {
      const result = await request(params);
      if (result.status !== "available") throw new Error(`Public records ${result.status}`);
      return result.presentation;
    };
    request()
      .then((result) => {
        if (!active) return;
        if (result.status === "available") setStore(new PublicRecordExplorationStore(root, result.presentation, load));
        else setFailure(result.status);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFailure("unavailable");
        reportApplicationError(error);
      });
    return () => {
      active = false;
    };
  }, [request, root]);

  const { chart } = selection;
  const title = chart.name;
  const count = store
    ? t("RecordWidgets.contributingCount", { count: store.pagination?.total ?? store.items.length })
    : null;

  return (
    <AppModal
      sheet
      titleInContent
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      focusReturnTarget={selection.opener}
      open={open}
      title={title}
      onClose={onClose}
    >
      <AppCardHeader className="flex-col items-start gap-1 pb-4">
        <AppModalTitle className="w-full truncate text-lg font-semibold">{title}</AppModalTitle>

        <p className="w-full truncate text-sm text-muted-foreground" id="public-widget-drawer-summary">
          {[selection.label, count].filter(Boolean).join(" · ")}
        </p>
      </AppCardHeader>

      {chart.displayOptions.displayType === DisplayType.number ? null : (
        <div
          className={cn(
            "flex shrink-0 flex-col px-6 pb-4",
            chart.displayOptions.displayType === DisplayType.rankedTable ? "max-h-64" : "h-56",
          )}
          data-widget-detail-chart=""
          id="public-widget-drawer-chart"
        >
          <RecordWidgetChart
            embedded
            data={chart.data}
            decimalPlaces={chart.decimalPlaces}
            displayOptions={chart.displayOptions}
            groupOptions={chart.groupOptions}
            listLabels={chart.listLabels}
            measure={chart.measure}
            name={chart.name}
            status={chart.status}
            onInspectGroup={onSelect}
          />
        </div>
      )}

      {failure ? (
        <PageState
          state="error"
          title={failure === "rateLimited" ? t("PublicLink.rateLimitedTitle") : t("PublicLink.unavailableTitle")}
        />
      ) : store ? (
        <ScopedRecordsTable emptyTitle={t("Diagrams.noData")} store={store} />
      ) : (
        <div aria-label={t("Loading.text")} className="space-y-3 px-6 py-3" role="status">
          <Skeleton className="h-9" />

          <Skeleton className="h-48" />
        </div>
      )}
    </AppModal>
  );
});
