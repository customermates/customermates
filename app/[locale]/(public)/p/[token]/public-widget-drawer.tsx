"use client";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { PublicChartWidget } from "@/features/public-link/public-link.schema";
import type { RecordContributionGroup } from "@/features/records/record-contribution.schema";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ScopedRecordsSheetFrame } from "@/components/records/scoped-records-sheet";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { DisplayType } from "@/features/widget/widget-display.schema";
import { RecordWidgetChart } from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/record-widget-chart";
import {
  LEAD_FRAME_CLASS,
  LEAD_HEIGHT_CLASS,
} from "@/app/[locale]/(protected)/w/[workspace]/dashboard/components/widget-data-drawer";

import { readPublicWidgetRecordsAction } from "./actions";
import { PublicRecordExplorationStore } from "./public-record-exploration.store";
import { publicRecordsQuery } from "./public-records-query";

export type PublicWidgetSelection = {
  widget: string;
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
  const [searchable, setSearchable] = useState(false);
  const [failure, setFailure] = useState<"unavailable" | "rateLimited" | null>(null);
  const [attempt, setAttempt] = useState(0);

  const request = useMemo(
    () => (params?: GetQueryParams) =>
      readPublicWidgetRecordsAction({
        token,
        widget: selection.widget,
        group: selection.group,
        label: selection.label,
        ...publicRecordsQuery(params),
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
        if (result.status === "available") {
          setStore(new PublicRecordExplorationStore(root, result.presentation, load));
          setSearchable(result.searchable);
        } else setFailure(result.status);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFailure("unavailable");
        reportApplicationError(error);
      });
    return () => {
      active = false;
    };
  }, [request, root, attempt]);

  const { chart } = selection;
  const count = store
    ? t("RecordWidgets.contributingCount", { count: store.pagination?.total ?? store.items.length })
    : null;

  return (
    <ScopedRecordsSheetFrame
      emptyTitle={t("Diagrams.noData")}
      error={
        failure
          ? {
              title: failure === "rateLimited" ? t("PublicLink.rateLimitedTitle") : t("PublicLink.unavailableTitle"),
              retry: () => setAttempt((value) => value + 1),
            }
          : null
      }
      idPrefix="public-widget-drawer"
      lead={
        chart.displayOptions.displayType === DisplayType.number ? null : (
          <div
            className={cn(LEAD_FRAME_CLASS, LEAD_HEIGHT_CLASS[chart.displayOptions.displayType] ?? "h-56")}
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
        )
      }
      open={open}
      opener={selection.opener}
      searchLabel={searchable ? t("PublicLink.searchLabel") : undefined}
      store={store}
      summary={[selection.label, count].filter(Boolean).join(" · ")}
      title={chart.name}
      onClose={onClose}
    />
  );
});
