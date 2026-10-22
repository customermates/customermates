"use client";

import type { PlannerOptions } from "@/features/planner/get-planner-options.interactor";
import type { PlannerSource } from "@/features/planner/planner.schema";
import type { PlannerResult } from "@/features/planner/read-planner.interactor";
import type { PlannerEntry } from "@/features/planner/planner-entries";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { DATA_VIEW_PAGE_CLASS_NAME } from "@/components/data-view/data-view-geometry";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageState } from "@/components/page-state/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useRecordValueFormat } from "@/components/records/record-value";
import { recordDisplayName } from "@/features/records/record-display-name";
import { useRootStore } from "@/core/stores/root-store.provider";
import { actionData } from "@/core/utils/action-data";
import { runUserAction, reportApplicationError } from "@/core/errors/report-application-error";
import { encodeGetParams } from "@/core/utils/get-params";
import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { browserTimeZone } from "@/core/utils/time-zone";
import { getProviderIcon } from "@/ee/messaging/provider-icon";
import { useClientReady } from "@/hooks/use-client-ready";
import { useIsWiderThan } from "@/hooks/use-media-query";
import { IntlLink } from "@/i18n/navigation";
import { PLANNER_MODES, PLANNER_SOURCE_LIMIT } from "@/features/planner/planner.schema";
import { plannerEntries, plannerIsTruncated } from "@/features/planner/planner-entries";
import { showsInAllDayLane } from "@/features/planner/planner-week-layout";
import {
  addCalendarMonths,
  calendarDateInstant,
  calendarDateParts,
  startOfCalendarQuarter,
} from "@/features/record-calendar/calendar-date";
import { calendarWindowRange, shiftCalendarAnchor } from "@/features/record-calendar/calendar-window";
import { zonedDate } from "@/features/record-calendar/zoned-time";
import { isCalendarDateField } from "@/features/record-calendar/record-calendar-query";
import { RecordCalendarView } from "../../records/[typeId]/components/record-calendar-view";
import { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";
import { calendarSwatchStyle } from "../../records/[typeId]/components/record-calendar-layout";
import { cn } from "@/core/utils/cn";
import { readPlannerAction } from "../actions";
import { plannerCalendarAdapter, plannerEntryColors } from "./planner-calendar-adapter";
import { PlannerSettingsStore } from "./planner-settings.store";
import { PlannerSourceModal } from "./planner-source-modal";
import { PlannerWeekSchedule } from "./planner-week-schedule";
import { PlannerTimeline } from "./planner-timeline";
import { PlannerEventModal } from "./planner-event-modal";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { PlannerSubscriptionsModal } from "./planner-subscriptions-modal";

const EMPTY_RESULT: PlannerResult = { sources: [], events: [], personalTruncated: false };
const UTC = "UTC";

function sourceHref(source: PlannerSource) {
  const params = encodeGetParams({
    filters: source.filters,
    viewMode: ViewMode.table,
    viewId: ALL_VIEW_KEY,
  });
  params.set("viewMode", ViewMode.table);
  return `/records/${source.typeId}?${params}`;
}

const PlannerPageViewContent = observer(function PlannerPageView({ options }: { options: PlannerOptions }) {
  const t = useTranslations();
  const root = useRootStore();
  const format = useRecordValueFormat();
  const modeLabels = {
    month: t("DataView.calendar.modes.month"),
    week: t("DataView.calendar.modes.week"),
    quarter: t("Planner.modes.quarter"),
    timeline: t("Planner.modes.timeline"),
    agenda: t("DataView.calendar.modes.agenda"),
  };
  const wide = useIsWiderThan("sm");
  const clientReady = useClientReady();
  const timeZones = useMemo(
    () => [UTC, ...Intl.supportedValuesOf("timeZone")].map((value) => ({ value, label: value.replace(/_/gu, " ") })),
    [],
  );
  const [settings] = useState(() => new PlannerSettingsStore(options.config));
  const config = settings.config;
  const setConfig = settings.setConfig;
  const [anchor, setAnchor] = useState(() => zonedDate(new Date(), options.config.timeZone));
  const [data, setData] = useState<PlannerResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sourceEditor, setSourceEditor] = useState<{ source: PlannerSource; creating: boolean } | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [eventDetail, setEventDetail] = useState<PlannerEntry | null>(null);
  const request = useRef(0);
  const mode = wide ? config.mode : "agenda";
  const windowMode = mode === "quarter" || mode === "timeline" ? "quarter" : mode;
  const range = useMemo(() => calendarWindowRange(windowMode, anchor), [windowMode, anchor]);
  const calendarWindow = useMemo(() => ({ ...range, timeZone: config.timeZone }), [range, config.timeZone]);
  const fetchKey = JSON.stringify({
    config: {
      sources: config.sources.filter((source) => source.enabled).map(({ color: _color, ...source }) => source),
      calendarIds: config.calendarIds,
      timeZone: config.timeZone,
    },
    window: range,
  });
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setRefreshing(true);
    setFailed(false);
    try {
      const value = await actionData(readPlannerAction(JSON.parse(fetchKey)));
      if (current === request.current) setData(value);
    } catch (error) {
      if (current === request.current) {
        setFailed(true);
        reportApplicationError(error);
      }
    } finally {
      if (current === request.current) setRefreshing(false);
    }
  }, [fetchKey]);
  useEffect(() => {
    void refresh().catch(reportApplicationError);
    return () => {
      request.current += 1;
    };
  }, [refresh]);
  useEffect(() => root.recordWorkspaceStore.subscribe(refresh), [root, refresh]);
  useEffect(() => {
    window.addEventListener("pagehide", settings.flush);
    return () => {
      window.removeEventListener("pagehide", settings.flush);
      settings.flush();
    };
  }, [settings]);
  useEffect(() => {
    if (!options.config.sources.length && !options.config.calendarIds.length && options.config.timeZone === UTC) {
      const timeZone = browserTimeZone();
      setConfig((current) => ({ ...current, timeZone }), { persist: false });
    }
  }, [options.config, setConfig]);
  const result = data ?? EMPTY_RESULT;
  const name = useCallback(
    (item: PlannerEntry) =>
      recordDisplayName(
        item.title,
        item.record
          ? options.model.types.find((type) => type.id === item.record?.ref.typeId)?.label
          : t("Planner.event"),
        t,
      ),
    [options.model, t],
  );
  const shown = useMemo(
    () =>
      new Set([...config.sources.filter((source) => source.enabled).map((source) => source.id), ...config.calendarIds]),
    [config.sources, config.calendarIds],
  );
  const entries = useMemo(
    () => plannerEntries(result, config.timeZone).filter((item) => shown.has(item.sourceId)),
    [result, config.timeZone, shown],
  );
  const byId = new Map(entries.map((item) => [item.id, item]));
  const colors = useMemo(() => plannerEntryColors(config, result), [config, result]);
  const open = useCallback(
    (item: PlannerEntry, opener?: HTMLElement | null) => {
      if (item.record) root.recordWorkspaceStore.open(item.record.ref, opener);
      else setEventDetail(item);
    },
    [root],
  );
  const stores = useMemo(
    () =>
      new Map(
        result.sources.flatMap((source) => {
          if (source.status !== "ready") return [];
          const store = new RecordExplorationStore(root, source.presentation);
          store.setCalendarTimeZone(config.timeZone);
          return [[source.source.id, store] as const];
        }),
      ),
    [root, result, config.timeZone],
  );
  const adapter = useMemo(
    () =>
      plannerCalendarAdapter({
        stores,
        colors,
        entries,
        anchor,
        mode: windowMode === "quarter" ? "month" : windowMode,
        window: calendarWindow,
        refreshing,
        refresh,
        navigate: setAnchor,
      }),
    [stores, colors, entries, anchor, windowMode, calendarWindow, refreshing, refresh],
  );
  const dateLabel = (date: string, full = false) =>
    format.date(
      calendarDateInstant(date),
      full ? { dateStyle: "medium", timeZone: UTC } : { month: "long", year: "numeric", timeZone: UTC },
    );
  const firstMonth = startOfCalendarQuarter(anchor);
  const title =
    mode === "week"
      ? `${dateLabel(calendarWindow.from, true)} – ${dateLabel(calendarWindow.to, true)}`
      : windowMode === "quarter"
        ? t("Planner.quarterLabel", {
            number: Math.floor((calendarDateParts(anchor).month - 1) / 3) + 1,
            year: calendarDateParts(anchor).year,
          })
        : dateLabel(anchor);
  const setSource = (source: PlannerSource) => {
    setConfig((current) => ({
      ...current,
      sources: current.sources.some((item) => item.id === source.id)
        ? current.sources.map((item) => (item.id === source.id ? source : item))
        : [...current.sources, source],
    }));
    setSourceEditor(null);
  };
  const canAddSource =
    clientReady && config.sources.length < PLANNER_SOURCE_LIMIT && options.model.fields.some(isCalendarDateField);
  const addSource = useCallback(() => {
    const field = options.model.fields.find(
      (field) =>
        isCalendarDateField(field) && options.model.types.some((type) => type.id === field.typeId && !type.archived),
    );
    if (field) {
      setSourceEditor({
        creating: true,
        source: {
          id: crypto.randomUUID(),
          typeId: field.typeId,
          calendar: { dateFieldId: field.id },
          filters: [],
          enabled: true,
          color: "default",
        },
      });
    }
  }, [options.model]);
  const sourceName = (source: PlannerSource) => {
    const type = options.model.types.find((type) => type.id === source.typeId);
    const field = options.model.fields.find((field) => field.id === source.calendar.dateFieldId);
    return type && field ? `${type.pluralLabel} · ${field.label}` : t("Planner.unavailableSource");
  };
  const topBarActions = useMemo(
    () => (
      <TopBarActionButtons
        actions={[
          {
            id: "planner-sources",
            icon: SlidersHorizontal,
            label: t("Planner.sources"),
            onClick: () => setSourcesOpen(true),
          },
          {
            id: "planner-sync",
            icon: Download,
            label: t("Planner.calendarSync"),
            disabled: !clientReady,
            onClick: () => setSubscriptionsOpen(true),
          },
          {
            id: "planner-add",
            icon: Plus,
            label: t("Planner.addSource"),
            disabled: !canAddSource,
            onClick: addSource,
          },
        ]}
      />
    ),
    [t, clientReady, canAddSource, addSource],
  );
  useSetTopBarActions(topBarActions);
  const recordName = (row: { id: string }) => {
    const item = byId.get(row.id);
    return item ? name(item) : "";
  };
  const openRow = (row: { id: string }, opener?: HTMLElement | null) => {
    const item = byId.get(row.id);
    if (item) open(item, opener);
  };
  const empty = !config.sources.some((source) => source.enabled) && !config.calendarIds.length;
  return (
    <div className={cn(DATA_VIEW_PAGE_CLASS_NAME, "relative")} data-planner-page="">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <IconButton
            icon={ChevronLeft}
            label={t("Planner.previous")}
            onClick={() => setAnchor(shiftCalendarAnchor(windowMode, anchor, -1))}
          />

          <Button size="sm" variant="secondary" onClick={() => setAnchor(zonedDate(new Date(), config.timeZone))}>
            {t("Common.datePresets.today")}
          </Button>

          <IconButton
            icon={ChevronRight}
            label={t("Planner.next")}
            onClick={() => setAnchor(shiftCalendarAnchor(windowMode, anchor, 1))}
          />

          <h2 aria-live="polite" className="min-w-0 text-sm font-semibold">
            {title}
          </h2>

          {refreshing && <Spinner aria-label={t("Loading.text")} className="size-4" />}

          {wide && (
            <SegmentedControl
              className="ml-auto max-w-full overflow-x-auto"
              items={PLANNER_MODES.map((value) => ({
                value,
                label: modeLabels[value],
                controls: false as const,
              }))}
              label={t("DataView.calendar.mode")}
              value={config.mode}
              onValueChange={(mode) => setConfig((current) => ({ ...current, mode }))}
            />
          )}
        </div>

        {result.sources.some((source) => source.status === "unavailable") && (
          <p className="border-b bg-warning/10 px-4 py-2 text-xs text-warning" role="status">
            {t("Planner.sourceUnavailable")}
          </p>
        )}

        {plannerIsTruncated(result) && (
          <p className="border-b bg-warning/10 px-4 py-2 text-xs text-warning" role="status">
            {t("Planner.truncated")}
          </p>
        )}

        {failed && !data ? (
          <PageState
            action={
              <Button variant="secondary" onClick={() => runUserAction(refresh)}>
                {t("ErrorCard.retry")}
              </Button>
            }
            state="error"
            title={t("ErrorCard.title")}
          />
        ) : empty ? (
          <PageState
            action={
              <Button disabled={!canAddSource} variant="secondary" onClick={addSource}>
                {t("Planner.addSource")}
              </Button>
            }
            state="empty"
            title={t("Planner.noSources")}
          />
        ) : !data ? (
          <PageState
            background={<Skeleton className="h-full min-h-80" />}
            className="p-4"
            label={t("PageState.loading")}
            state="loading"
          />
        ) : mode === "timeline" ? (
          <PlannerTimeline
            color={colors}
            config={config}
            entries={entries}
            name={name}
            refreshing={refreshing}
            window={calendarWindow}
            onOpen={open}
          />
        ) : mode === "quarter" ? (
          <div
            className={cn(
              "grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] overflow-auto",
              refreshing && "opacity-70",
            )}
            data-planner-quarter=""
          >
            {[0, 1, 2].map((offset) => {
              const month = addCalendarMonths(firstMonth, offset);
              const monthWindow = { ...calendarWindowRange("month", month), timeZone: config.timeZone };
              const monthAdapter = {
                ...adapter,
                calendarFocusDate: month,
                calendarWindow: monthWindow,
                calendarRange: { ...monthWindow, total: entries.length, truncated: false },
              };
              return (
                <section key={month} className="flex min-h-132 min-w-0 flex-col border-r last:border-r-0">
                  <h3 className="border-b p-3 text-sm font-medium">{dateLabel(month)}</h3>

                  <RecordCalendarView hideToolbar recordName={recordName} store={monthAdapter} onOpenRecord={openRow} />
                </section>
              );
            })}
          </div>
        ) : mode === "week" ? (
          <div className="flex min-h-0 flex-1 flex-col" data-planner-week="">
            <div className="max-h-[40dvh] shrink-0 overflow-auto pl-12" data-planner-all-day="">
              <RecordCalendarView
                hideToolbar
                recordName={recordName}
                store={{
                  ...adapter,
                  normalizedCalendarItems: (pending) =>
                    adapter.normalizedCalendarItems?.(pending).filter((item) => showsInAllDayLane(item.entry)) ?? [],
                }}
                onOpenRecord={openRow}
              />
            </div>

            <PlannerWeekSchedule
              color={colors}
              config={config}
              entries={entries}
              name={name}
              refreshing={refreshing}
              window={calendarWindow}
              onOpen={open}
            />
          </div>
        ) : (
          <RecordCalendarView hideToolbar recordName={recordName} store={adapter} onOpenRecord={openRow} />
        )}
      </div>

      {sourcesOpen && (
        <AppModal open titleInContent size="lg" title={t("Planner.sources")} onClose={() => setSourcesOpen(false)}>
          <AppCard>
            <AppCardHeader>
              <AppModalTitle>{t("Planner.sources")}</AppModalTitle>
            </AppCardHeader>

            <AppCardBody>
              <div className="space-y-1">
                {config.sources.map((source) => (
                  <ItemActions
                    key={source.id}
                    label={sourceName(source)}
                    menu={
                      <>
                        <DropdownMenuItem asChild>
                          <IntlLink href={sourceHref(source)}>
                            <ArrowUpRight aria-hidden className="size-4" />

                            {t("Planner.openList")}
                          </IntlLink>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            setConfig((current) => ({
                              ...current,
                              sources: current.sources.filter((item) => item.id !== source.id),
                            }))
                          }
                        >
                          <Trash2 aria-hidden className="size-4" />

                          {t("Planner.removeSource")}
                        </DropdownMenuItem>
                      </>
                    }
                  >
                    <div
                      className="group/reveal flex min-w-0 items-start gap-2 rounded-md py-2"
                      data-planner-source={source.id}
                    >
                      <Checkbox
                        checked={source.enabled}
                        className="mt-0.5"
                        id={`planner-source-${source.id}`}
                        onCheckedChange={(checked) =>
                          setConfig((current) => ({
                            ...current,
                            sources: current.sources.map((item) =>
                              item.id === source.id ? { ...item, enabled: checked === true } : item,
                            ),
                          }))
                        }
                      />

                      <Label
                        className="min-w-0 flex-1 cursor-pointer leading-snug"
                        htmlFor={`planner-source-${source.id}`}
                      >
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block size-2 rounded-full"
                          style={calendarSwatchStyle(source.color)}
                        />

                        {sourceName(source)}

                        {source.filters.length > 0 && (
                          <span className="block pt-1 text-xs text-muted-foreground">
                            {t("Planner.filterCount", { count: source.filters.length })}
                          </span>
                        )}
                      </Label>

                      <IconButton
                        className="shrink-0"
                        icon={Pencil}
                        label={t("Planner.editSource", { source: sourceName(source) })}
                        onClick={() => setSourceEditor({ source, creating: false })}
                      />

                      <ItemActionsTrigger />
                    </div>
                  </ItemActions>
                ))}
              </div>

              {config.sources.length === 0 && <p className="text-sm text-muted-foreground">{t("Planner.noSources")}</p>}

              <Button disabled={!canAddSource} size="sm" variant="secondary" onClick={addSource}>
                <Plus aria-hidden className="size-4" />

                {t("Planner.addSource")}
              </Button>

              {options.personalAvailable && (
                <section className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-medium">{t("Planner.personalCalendars")}</h3>

                  {options.calendars.length ? (
                    options.calendars.map((calendar) => {
                      const ProviderIcon = getProviderIcon(calendar.provider);
                      return (
                        <div key={calendar.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={config.calendarIds.includes(calendar.id)}
                            id={`planner-personal-${calendar.id}`}
                            onCheckedChange={(checked) =>
                              setConfig((current) => ({
                                ...current,
                                calendarIds: checked
                                  ? [...new Set([...current.calendarIds, calendar.id])]
                                  : current.calendarIds.filter((id) => id !== calendar.id),
                              }))
                            }
                          />

                          <ProviderIcon aria-hidden className="size-4 shrink-0" />

                          <Label
                            className="min-w-0 cursor-pointer leading-snug"
                            htmlFor={`planner-personal-${calendar.id}`}
                          >
                            {calendar.name}
                          </Label>
                        </div>
                      );
                    })
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <IntlLink href="/settings/channels">{t("Planner.connectCalendar")}</IntlLink>
                    </Button>
                  )}
                </section>
              )}

              <FormAutocomplete
                id="planner-time-zone"
                items={timeZones}
                label={t("Planner.timeZone")}
                renderValue={(items) => items.map((item) => item.data?.label ?? item.key).join("")}
                value={config.timeZone}
                onValueChange={(value) => {
                  if (typeof value === "string" && value) setConfig((current) => ({ ...current, timeZone: value }));
                }}
              >
                {(item) => <FormAutocompleteItem textValue={item.label}>{item.label}</FormAutocompleteItem>}
              </FormAutocomplete>
            </AppCardBody>
          </AppCard>
        </AppModal>
      )}

      {sourceEditor && (
        <PlannerSourceModal
          creating={sourceEditor.creating}
          model={options.model}
          source={sourceEditor.source}
          onClose={() => setSourceEditor(null)}
          onSave={setSource}
        />
      )}

      {subscriptionsOpen && (
        <PlannerSubscriptionsModal
          config={config}
          personalAvailable={options.personalAvailable}
          truncated={plannerIsTruncated(result)}
          window={range}
          onClose={() => setSubscriptionsOpen(false)}
        />
      )}

      {eventDetail && (
        <PlannerEventModal
          event={eventDetail}
          name={name(eventDetail)}
          timeZone={config.timeZone}
          onClose={() => setEventDetail(null)}
        />
      )}
    </div>
  );
});

export const PlannerPageView = serverRenderedClient(PlannerPageViewContent);
