"use client";

import type { PlannerOptions } from "@/features/planner/get-planner-options.interactor";
import type { PlannerConfig, PlannerSource } from "@/features/planner/planner.schema";
import type { PlannerResult } from "@/features/planner/read-planner.interactor";
import type { PlannerEntry } from "@/features/planner/planner-entries";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useNavigationGuard } from "@/components/modal/use-navigation-guard";
import { PlannerSettingsStore } from "./planner-settings.store";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormSelect } from "@/components/forms/form-select";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
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
import { useClientReady } from "@/hooks/use-client-ready";
import { useIsWiderThan } from "@/hooks/use-media-query";
import { IntlLink } from "@/i18n/navigation";
import { PLANNER_MODES } from "@/features/planner/planner.schema";
import { plannerEntries, plannerIsTruncated } from "@/features/planner/planner-entries";
import {
  addCalendarDays,
  addCalendarMonths,
  calendarDateParts,
  endOfCalendarMonth,
  endOfCalendarWeek,
  startOfCalendarWeek,
} from "@/features/record-calendar/calendar-date";
import { calendarWindowRange } from "@/features/record-calendar/calendar-window";
import { zonedDate } from "@/features/record-calendar/zoned-time";
import { isCalendarDateField } from "@/features/record-calendar/record-calendar-query";
import { RecordCalendarView } from "../../records/[typeId]/components/record-calendar-view";
import { CALENDAR_ENTRY_COLOR_CLASS } from "../../records/[typeId]/components/record-calendar-layout";
import { cn } from "@/core/utils/cn";
import { readPlannerAction } from "../actions";
import { plannerCalendarAdapter } from "./planner-calendar-adapter";
import { PlannerSourceModal } from "./planner-source-modal";
import { PlannerWeekSchedule } from "./planner-week-schedule";
import { PlannerTimeline } from "./planner-timeline";
import { PlannerEventModal } from "./planner-event-modal";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { PlannerSubscriptionsModal } from "./planner-subscriptions-modal";

const EMPTY_RESULT: PlannerResult = { sources: [], events: [], personalTruncated: false };
function quarterStart(date: string) {
  const parts = calendarDateParts(date);
  return `${parts.year}-${String(Math.floor((parts.month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}
function sourceHref(source: PlannerSource) {
  const params = encodeGetParams({
    filters: source.filters,
    searchTerm: source.search,
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
  const intl = useHydratedIntlStore();
  const modeLabels = {
    month: t("Planner.modes.month"),
    week: t("Planner.modes.week"),
    quarter: t("Planner.modes.quarter"),
    timeline: t("Planner.modes.timeline"),
    agenda: t("Planner.modes.agenda"),
  };
  const sortLabels = {
    date: t("Planner.sorts.date"),
    title: t("Planner.sorts.title"),
    source: t("Planner.sorts.source"),
  };
  const wide = useIsWiderThan("sm");
  const clientReady = useClientReady();
  const timeZones = useMemo(
    () => [
      { value: "UTC", label: String("UTC") },
      ...Intl.supportedValuesOf("timeZone").map((value) => ({ value, label: value.replace(/_/gu, " ") })),
    ],
    [],
  );
  const [settings] = useState(() => new PlannerSettingsStore(root, options.config));
  useNavigationGuard(settings);
  const configJson = JSON.stringify(settings.form);
  const config = useMemo(() => JSON.parse(configJson) as PlannerConfig, [configJson]);
  const setConfig = settings.setConfig;
  const [anchor, setAnchor] = useState(() => zonedDate(new Date(), options.config.timeZone));
  const [data, setData] = useState<{ key: string; value: PlannerResult } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sourceEditor, setSourceEditor] = useState<PlannerSource | null>(null);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [eventDetail, setEventDetail] = useState<PlannerEntry | null>(null);
  const [search, setSearch] = useState("");
  const request = useRef(0);
  const mode = wide ? config.mode : "agenda";
  const firstMonth = quarterStart(anchor);
  const range = useMemo(
    () =>
      mode === "quarter" || mode === "timeline"
        ? {
            from: startOfCalendarWeek(firstMonth),
            to: endOfCalendarWeek(endOfCalendarMonth(addCalendarMonths(firstMonth, 2))),
          }
        : calendarWindowRange(mode, anchor),
    [mode, anchor, firstMonth],
  );
  const window = useMemo(() => ({ ...range, timeZone: config.timeZone }), [range, config.timeZone]);
  const key = JSON.stringify({ config, window });
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setRefreshing(true);
    setFailed(false);
    try {
      const value = await actionData(readPlannerAction({ config, window }));
      if (current === request.current) setData({ key, value });
    } catch (error) {
      if (current === request.current) {
        setFailed(true);
        reportApplicationError(error);
      }
    } finally {
      if (current === request.current) setRefreshing(false);
    }
  }, [config, window, key]);
  useEffect(() => {
    void refresh().catch(reportApplicationError);
    return () => {
      request.current += 1;
    };
  }, [refresh]);
  useEffect(() => root.recordWorkspaceStore.subscribe(refresh), [root, refresh]);
  useEffect(() => {
    if (!options.config.sources.length && !options.config.calendarIds.length && options.config.timeZone === "UTC") {
      const timeZone = browserTimeZone();
      settings.onInitOrRefresh({ timeZone });
    }
  }, [options.config, settings]);
  const result = data?.key === key ? data.value : EMPTY_RESULT;
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
  const entries = useMemo(
    () =>
      plannerEntries(result, config.timeZone)
        .filter(
          (item) =>
            !search || `${name(item)} ${item.sourceLabel}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          config.sort === "title"
            ? name(a).localeCompare(name(b), intl.formattingLocale)
            : config.sort === "source"
              ? a.sourceLabel.localeCompare(b.sourceLabel, intl.formattingLocale) ||
                (a.entry.start < b.entry.start ? -1 : a.entry.start > b.entry.start ? 1 : 0)
              : 0,
        ),
    [result, config.timeZone, config.sort, search, name, intl.formattingLocale],
  );
  const byId = new Map(entries.map((item) => [item.id, item]));
  const open = useCallback(
    (item: PlannerEntry, opener?: HTMLElement | null) => {
      if (item.record) {
        root.navigationGuard.unregister(settings);
        try {
          root.recordWorkspaceStore.open(item.record.ref, opener);
        } finally {
          root.navigationGuard.register(settings);
        }
      } else setEventDetail(item);
    },
    [root, settings],
  );
  const adapter = useMemo(
    () =>
      plannerCalendarAdapter({
        root,
        result,
        config,
        entries,
        anchor,
        mode: mode === "quarter" || mode === "timeline" ? "month" : mode,
        window,
        refreshing,
        refresh,
        navigate: setAnchor,
      }),
    [root, result, config, entries, anchor, mode, window, refreshing, refresh],
  );
  const dateLabel = (date: string, full = false) =>
    format.date(
      new Date(`${date}T00:00:00Z`),
      full ? { dateStyle: "medium", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" },
    );
  const title =
    mode === "week"
      ? `${dateLabel(window.from, true)} – ${dateLabel(window.to, true)}`
      : mode === "quarter" || mode === "timeline"
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
  const addSource = () => {
    const field = options.model.fields.find(
      (field) =>
        isCalendarDateField(field) && options.model.types.some((type) => type.id === field.typeId && !type.archived),
    );
    if (field) {
      setSourceEditor({
        id: crypto.randomUUID(),
        typeId: field.typeId,
        calendar: { dateFieldId: field.id },
        filters: [],
        search: "",
        enabled: true,
        color: "default",
      });
    }
  };
  const sourceName = (source: PlannerSource) => {
    const type = options.model.types.find((type) => type.id === source.typeId);
    const field = options.model.fields.find((field) => field.id === source.calendar.dateFieldId);
    return type && field ? `${type.pluralLabel} · ${field.label}` : t("Planner.unavailableSource");
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col p-3 md:p-6" data-planner-page="">
      <AppCard className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AppCardHeader className="flex-wrap justify-between gap-3 border-b p-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays aria-hidden className="size-5 text-muted-foreground" />

            {t("Planner.title")}
          </h1>

          <Button disabled={!clientReady} size="sm" variant="secondary" onClick={() => setSubscriptionsOpen(true)}>
            <Download aria-hidden className="size-4" />

            {t("Planner.calendarSync")}
          </Button>
        </AppCardHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside
            aria-label={t("Planner.sources")}
            className="flex shrink-0 flex-col gap-4 overflow-y-auto border-b p-4 md:w-64 md:border-r md:border-b-0"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{t("Planner.sources")}</h2>

              <IconButton
                disabled={
                  !clientReady || config.sources.length >= 12 || !options.model.fields.some(isCalendarDateField)
                }
                icon={Plus}
                label={t("Planner.addSource")}
                onClick={addSource}
              />
            </div>

            <div className="space-y-1">
              {config.sources.map((source) => (
                <ItemActions
                  key={source.id}
                  label={sourceName(source)}
                  menu={
                    <>
                      <DropdownMenuItem onSelect={() => setSourceEditor(source)}>
                        <Pencil aria-hidden className="size-4" />

                        {t("Planner.sourceSettings")}
                      </DropdownMenuItem>

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
                      onCheckedChange={(checked) => setSource({ ...source, enabled: checked === true })}
                    />

                    <Label
                      className="min-w-0 flex-1 cursor-pointer leading-snug"
                      htmlFor={`planner-source-${source.id}`}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mr-1.5 inline-block size-2 rounded-full",
                          CALENDAR_ENTRY_COLOR_CLASS[source.color],
                        )}
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
                      onClick={() => setSourceEditor(source)}
                    />

                    <ItemActionsTrigger />
                  </div>
                </ItemActions>
              ))}
            </div>

            {config.sources.length === 0 && <p className="text-sm text-muted-foreground">{t("Planner.noSources")}</p>}

            <Button
              disabled={!clientReady || config.sources.length >= 12 || !options.model.fields.some(isCalendarDateField)}
              size="sm"
              variant="secondary"
              onClick={addSource}
            >
              <Plus aria-hidden className="size-4" />

              {t("Planner.addSource")}
            </Button>

            {options.personalAvailable && (
              <section className="space-y-3 border-t pt-4">
                <h2 className="text-sm font-medium">{t("Planner.personalCalendars")}</h2>

                {options.calendars.length ? (
                  options.calendars.map((calendar) => (
                    <div key={calendar.id} className="flex items-start gap-2">
                      <Checkbox
                        checked={config.calendarIds.includes(calendar.id)}
                        className="mt-0.5"
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

                      <Label
                        className="min-w-0 cursor-pointer leading-snug"
                        htmlFor={`planner-personal-${calendar.id}`}
                      >
                        {calendar.name}

                        <span className="block pt-1 text-xs text-muted-foreground">{calendar.provider}</span>
                      </Label>
                    </div>
                  ))
                ) : (
                  <Button asChild size="sm" variant="ghost">
                    <IntlLink href="/settings/channels">{t("Planner.connectCalendar")}</IntlLink>
                  </Button>
                )}
              </section>
            )}

            <FormSelect
              id="planner-time-zone"
              items={timeZones}
              label={t("Planner.timeZone")}
              value={config.timeZone}
              onValueChange={(timeZone) => setConfig((current) => ({ ...current, timeZone }))}
            />
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <IconButton
                icon={ChevronLeft}
                label={t("Planner.previous")}
                onClick={() =>
                  setAnchor(
                    mode === "week"
                      ? addCalendarDays(anchor, -7)
                      : addCalendarMonths(anchor, mode === "quarter" || mode === "timeline" ? -3 : -1),
                  )
                }
              />

              <Button size="sm" variant="secondary" onClick={() => setAnchor(zonedDate(new Date(), config.timeZone))}>
                {t("Common.datePresets.today")}
              </Button>

              <IconButton
                icon={ChevronRight}
                label={t("Planner.next")}
                onClick={() =>
                  setAnchor(
                    mode === "week"
                      ? addCalendarDays(anchor, 7)
                      : addCalendarMonths(anchor, mode === "quarter" || mode === "timeline" ? 3 : 1),
                  )
                }
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

            <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
              <Input
                aria-label={t("Planner.search")}
                className="h-8 w-64 max-w-full"
                placeholder={t("Planner.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <FormSelect
                ariaLabel={t("Planner.sort")}
                id="planner-sort"
                items={(["date", "title", "source"] as const).map((value) => ({
                  value,
                  label: sortLabels[value],
                }))}
                label={null}
                value={config.sort}
                onValueChange={(value) =>
                  setConfig((current) => ({ ...current, sort: value as PlannerConfig["sort"] }))
                }
              />
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

            {failed ? (
              <PageState
                action={
                  <Button variant="secondary" onClick={() => runUserAction(refresh)}>
                    {t("ErrorCard.retry")}
                  </Button>
                }
                state="error"
                title={t("ErrorCard.title")}
              />
            ) : !data || data.key !== key ? (
              <div className="flex-1 p-4">
                <Skeleton className="h-full min-h-80" />
              </div>
            ) : !config.sources.some((source) => source.enabled) && !config.calendarIds.length ? (
              <PageState
                action={
                  <Button disabled={!clientReady} variant="secondary" onClick={addSource}>
                    {t("Planner.addSource")}
                  </Button>
                }
                state="empty"
                title={t("Planner.noSources")}
              />
            ) : mode === "timeline" ? (
              <PlannerTimeline config={config} entries={entries} name={name} window={window} onOpen={open} />
            ) : mode === "quarter" ? (
              <div
                className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))] overflow-auto"
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

                      <RecordCalendarView
                        hideToolbar
                        recordName={(row) => {
                          const item = byId.get(row.id);
                          return item ? name(item) : "";
                        }}
                        store={monthAdapter}
                        onOpenRecord={(row, opener) => {
                          const item = byId.get(row.id);
                          if (item) open(item, opener);
                        }}
                      />
                    </section>
                  );
                })}
              </div>
            ) : mode === "week" ? (
              <div className="flex min-h-0 flex-1 flex-col" data-planner-week="">
                <div className="h-32 shrink-0 overflow-auto pl-12">
                  <RecordCalendarView
                    hideToolbar
                    recordName={(row) => {
                      const item = byId.get(row.id);
                      return item ? name(item) : "";
                    }}
                    store={{
                      ...adapter,
                      normalizedCalendarItems: (pending) =>
                        adapter.normalizedCalendarItems?.(pending).filter((item) => !item.entry.time) ?? [],
                    }}
                    onOpenRecord={(row, opener) => {
                      const item = byId.get(row.id);
                      if (item) open(item, opener);
                    }}
                  />
                </div>

                <PlannerWeekSchedule config={config} entries={entries} name={name} window={window} onOpen={open} />
              </div>
            ) : (
              <RecordCalendarView
                hideToolbar
                recordName={(row) => {
                  const item = byId.get(row.id);
                  return item ? name(item) : "";
                }}
                store={adapter}
                onOpenRecord={(row, opener) => {
                  const item = byId.get(row.id);
                  if (item) open(item, opener);
                }}
              />
            )}
          </main>
        </div>
      </AppCard>

      <UnsavedChangesBar anchorScope="planner" store={settings} onSave={settings.onSubmit} />

      {sourceEditor && (
        <PlannerSourceModal
          model={options.model}
          source={sourceEditor}
          onClose={() => setSourceEditor(null)}
          onSave={setSource}
        />
      )}

      {subscriptionsOpen && (
        <PlannerSubscriptionsModal
          config={config}
          personalAvailable={options.personalAvailable}
          window={window}
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
