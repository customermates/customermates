"use client";

import type { RecordDisplayField } from "@/features/records/record-display-field.schema";
import type { MapWidgetData, MapWidgetPoint, MapWidgetQuery } from "@/features/widget/record-map-widget.schema";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { RecordValue } from "@/components/records/record-value";
import { TruncatedText } from "@/components/shared/truncated-text";
import { Button } from "@/components/ui/button";
import { getChartColors } from "@/constants/chart-colors";
import { toChipColor } from "@/constants/chip-colors";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { recordDisplayName } from "@/features/records/record-display-name";
import { IntlLink } from "@/i18n/navigation";

import { MapWidgetSkeleton } from "./dashboard-page-skeleton";
import { mapLegend, mapViewPoints } from "./map-widget-view";
import { WIDGET_CARD_BODY_CLASS, WIDGET_CARD_HEADER_CLASS, WIDGET_CARD_TITLE_CLASS } from "./widget-card-frame";
import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";
import { WidgetSourceSummary } from "./widget-source-summary";

const MapView = dynamic(() => import("@/components/map/map-view"), {
  ssr: false,
  loading: () => <MapWidgetSkeleton />,
});

export type RecordMapWidgetCardProps = {
  name: string;
  mapQuery: MapWidgetQuery;
  displayOptions: { showFilters: boolean };
  status: "ready" | "unavailable";
  data: MapWidgetData | null;
  fields: RecordDisplayField[];
  listLabels?: { label: string; pluralLabel: string } | null;
  openRecords?: boolean;
  onOpenFilters?: () => void;
};

export const RecordMapWidgetCard = observer(function RecordMapWidgetCard({
  name,
  mapQuery,
  displayOptions,
  status,
  data,
  fields,
  listLabels = null,
  openRecords = false,
  onOpenFilters,
}: RecordMapWidgetCardProps) {
  const t = useTranslations();
  const language = useLocale();
  const { recordWorkspaceStore } = useRootStore();
  const mapRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const field = (id: string | null) => (id ? fields.find((candidate) => candidate.id === id) : undefined);
  const addressField = field(mapQuery.addressFieldId);
  const colorField = field(mapQuery.colorFieldId);
  const sizeField = field(mapQuery.sizeFieldId);
  const detailField = field(mapQuery.detailFieldId);
  const points = useMemo(() => mapViewPoints(data?.points ?? [], colorField), [data, colorField]);
  const legend = useMemo(() => mapLegend(data?.points ?? [], colorField), [data, colorField]);
  const byId = useMemo(() => new Map((data?.points ?? []).map((point) => [point.record.recordId, point])), [data]);
  const ready = status === "ready" && data !== null;
  const summary = [
    listLabels?.pluralLabel,
    addressField?.label,
    colorField && t("RecordMapWidgets.colorSummary", { field: colorField.label }),
    sizeField && t("RecordMapWidgets.sizeSummary", { field: sizeField.label }),
  ]
    .filter(Boolean)
    .join(" · ");
  const pointName = (point: MapWidgetPoint) => recordDisplayName(point.title, listLabels?.label, t);

  function renderPopover(id: string) {
    const point = byId.get(id);
    if (!point) return null;
    const option = colorField?.options.find((candidate) => candidate.id === point.color);
    return (
      <div className="flex flex-col gap-2" data-map-widget-popover={id} {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}>
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">{pointName(point)}</p>

          <p className="text-xs text-muted-foreground">{point.address}</p>

          {point.precision === "postcode" && (
            <p className="text-xs text-muted-foreground">{t("RecordMapWidgets.postcodePrecision")}</p>
          )}
        </div>

        {option && (
          <div className="flex">
            <AppChip variant={toChipColor(option.color)}>{option.label}</AppChip>
          </div>
        )}

        {(sizeField || detailField) && (
          <dl className="flex flex-col gap-1 text-xs">
            {[
              sizeField && { field: sizeField, result: point.size },
              detailField && { field: detailField, result: point.detail },
            ]
              .filter((row) => Boolean(row))
              .map((row) =>
                row ? (
                  <div key={row.field.id} className="flex min-w-0 items-center justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{row.field.label}</dt>

                    <dd className="min-w-0 truncate text-right">
                      <RecordValue compact field={row.field} result={row.result ?? { state: "missing" }} />
                    </dd>
                  </div>
                ) : null,
              )}
          </dl>
        )}

        {openRecords && (
          <Button asChild className="self-start" size="sm" variant="secondary">
            <IntlLink
              href={`/records/${point.record.typeId}/${point.record.recordId}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
                event.preventDefault();
                setSelectedId(null);
                recordWorkspaceStore.open(point.record, event.currentTarget, mapRef.current);
              }}
            >
              {t("RecordMapWidgets.openRecord")}
            </IntlLink>
          </Button>
        )}
      </div>
    );
  }

  const hints = ready
    ? [
        data.withoutLocation > 0 && t("RecordMapWidgets.withoutLocation", { count: data.withoutLocation }),
        data.truncated && t("RecordMapWidgets.truncated", { count: data.points.length }),
      ].filter((hint): hint is string => Boolean(hint))
    : [];

  return (
    <AppCard className="h-full cursor-pointer overflow-hidden" data-widget-kind="map">
      <AppCardHeader className={WIDGET_CARD_HEADER_CLASS}>
        <h2 className={WIDGET_CARD_TITLE_CLASS}>
          <TruncatedText>{name}</TruncatedText>
        </h2>

        {displayOptions.showFilters && (
          <WidgetSourceSummary source={mapQuery.source} summary={summary} onOpenFilters={onOpenFilters} />
        )}
      </AppCardHeader>

      <AppCardBody
        className={cn(WIDGET_CARD_BODY_CLASS, "min-h-0 flex-1 gap-2")}
        {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
      >
        {!ready ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("RecordMapWidgets.unavailable")}
          </p>
        ) : points.length === 0 ? (
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center"
            data-slot="widget-empty"
          >
            <MapPin aria-hidden className="size-6 text-muted-foreground/60" />

            <p className="text-sm text-muted-foreground">{t("RecordMapWidgets.noPoints")}</p>
          </div>
        ) : (
          <div ref={mapRef} className="relative min-h-0 flex-1" data-map-widget="">
            <MapView
              className="absolute inset-0 min-h-0"
              label={t("RecordMapWidgets.label", { name })}
              labels={{
                zoomIn: t("RecordModel.graph.zoomIn"),
                zoomOut: t("RecordModel.graph.zoomOut"),
                reset: t("RecordModel.graph.fitView"),
                loading: t("RecordMapWidgets.loading"),
                failed: t("RecordMapWidgets.failed"),
                attribution: t("RecordMapWidgets.attribution"),
                cluster: (count) => t("RecordMapWidgets.cluster", { count }),
                point: (id) => {
                  const point = byId.get(id);
                  return point
                    ? t("RecordMapWidgets.point", { name: pointName(point), address: point.address })
                    : t("RecordModel.record");
                },
              }}
              language={language}
              points={points}
              renderPopover={renderPopover}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        )}

        {(legend.length > 0 || hints.length > 0) && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {legend.length > 0 && (
              <ul aria-label={colorField?.label} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                {legend.map((entry) => (
                  <li
                    key={entry.kind === "option" ? entry.id : entry.kind}
                    className="flex min-w-0 items-center gap-1.5"
                    data-map-legend={entry.kind === "option" ? entry.id : entry.kind === "mixed" ? "mixed" : ""}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        entry.color === null && "border-[1.5px] border-muted-foreground bg-card",
                      )}
                      style={entry.color ? { backgroundColor: getChartColors()[entry.color] } : undefined}
                    />

                    <span className="truncate">
                      {entry.kind === "mixed" ? t("RecordMapWidgets.mixed") : (entry.label ?? t("RecordModel.missing"))}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {hints.map((hint) => (
              <span key={hint} className="ml-auto" data-map-hint="">
                {hint}
              </span>
            ))}
          </div>
        )}
      </AppCardBody>
    </AppCard>
  );
});
