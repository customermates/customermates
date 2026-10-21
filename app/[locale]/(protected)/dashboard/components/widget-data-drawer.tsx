"use client";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { RecordContributionGroup } from "@/features/records/record-contribution.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ViewMode } from "@/core/base/base-query-builder";
import { actionData } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { recordContributionFilter } from "@/features/records/record-contribution-link";
import { getWidgetByIdAction } from "../actions";
import { isRecordWidget } from "@/features/widget/widget.schema";
import { getRecordPresentationAction } from "../../records/actions";
import { openWidgetEditor } from "./widget-interaction";
import { RecordWidgetChart } from "./record-widget-chart";
import { WidgetRecordsTable } from "./widget-records-table";

export type WidgetDataSelection = {
  widget: RecordWidgetDto;
  group: RecordContributionGroup | null;
  label: string | null;
  opener: HTMLElement | null;
};

export function WidgetDataDrawer({
  selection,
  onClose,
  onSelect,
}: {
  selection: WidgetDataSelection;
  onClose: () => void;
  onSelect: (group: RecordContributionGroup | null, label: string | null) => void;
}) {
  const root = useRootStore();
  const t = useTranslations();
  const { group, label } = selection;
  const [widget, setWidget] = useState(selection.widget);
  const [chartFailed, setChartFailed] = useState(false);
  useEffect(
    () =>
      root.recordWorkspaceStore.subscribe(async () => {
        try {
          const updated = await actionData(getWidgetByIdAction({ id: selection.widget.id }));
          if (!updated || !isRecordWidget(updated)) {
            setChartFailed(true);
            return;
          }
          setWidget(updated);
          setChartFailed(false);
        } catch (cause) {
          setChartFailed(true);
          reportApplicationError(cause);
        }
      }),
    [root, selection.widget.id],
  );
  const [presentation, setPresentation] = useState<{ key: string; data: RecordPresentationResult } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const filter = useMemo(
    () => recordContributionFilter({ measure: widget.measure, group, title: widget.name, groupLabel: label }),
    [widget.measure, widget.name, group, label],
  );
  const key = String("value" in filter ? filter.value : "");
  useEffect(() => {
    let active = true;
    setError(false);
    actionData(
      getRecordPresentationAction(widget.measure.source.typeId, {
        filters: [filter],
        searchTerm: "",
        viewMode: ViewMode.table,
        grouping: null,
        page: 1,
        pageSize: 10,
        viewId: ALL_VIEW_KEY,
      }),
    )
      .then((data) => {
        if (active) setPresentation({ key, data });
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(true);
          reportApplicationError(cause);
        }
      });
    return () => {
      active = false;
    };
  }, [key, filter, widget.measure.source.typeId, attempt]);
  return (
    <AppModal
      open
      sheet
      actions={[
        {
          id: "edit-widget",
          label: t("Dashboard.widgetEditor.editTitle", { name: widget.name }),
          icon: Pencil,
          onClick: () => {
            onClose();
            return openWidgetEditor(root.widgetModalStore, widget.id);
          },
        },
      ]}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      focusReturnTarget={selection.opener}
      size="5xl"
      title={t("RecordWidgets.dataTitle", { name: widget.name })}
      onClose={onClose}
    >
      <AppCard className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-64 shrink-0 flex-col" data-widget-detail-chart="">
          {chartFailed ? (
            <PageState state="error" title={t("RecordWidgets.unavailable")} />
          ) : (
            <RecordWidgetChart {...widget} onInspectGroup={onSelect} />
          )}
        </div>

        <AppCardBody className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
          {error ? (
            <PageState
              action={
                <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                  {t("ErrorCard.retry")}
                </Button>
              }
              state="error"
              title={t("RecordWidgets.unavailable")}
            />
          ) : presentation?.key === key ? (
            <WidgetRecordsTable key={key} presentation={presentation.data} />
          ) : (
            <div aria-label={t("Loading.text")} className="space-y-3" role="status">
              <Skeleton className="h-9" />

              <Skeleton className="h-48" />
            </div>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
