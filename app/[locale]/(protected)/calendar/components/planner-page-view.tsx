"use client";

import type { PlannerOptions } from "@/features/planner/get-planner-options.interactor";
import type { PlannerQuery, PlannerSource } from "@/features/planner/planner.schema";
import type { PlannerResult } from "@/features/planner/read-planner.interactor";
import type { PlannerEntry } from "@/features/planner/planner-entries";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
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
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Calendar, focusCalendarDay } from "@/components/ui/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PageState } from "@/components/page-state/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useRecordValueFormat } from "@/components/records/record-value";
import { recordDisplayName } from "@/features/records/record-display-name";
import { useRootStore } from "@/core/stores/root-store.provider";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
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
import { calendarDateInstant, calendarDateOf, calendarDateParts } from "@/features/record-calendar/calendar-date";
import { calendarWindowRange, shiftCalendarAnchor } from "@/features/record-calendar/calendar-window";
import { zonedDate } from "@/features/record-calendar/zoned-time";
import { isCalendarDateField } from "@/features/record-calendar/record-calendar-query";
import { RecordCalendarView } from "../../records/[typeId]/components/record-calendar-view";
import { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";
import { calendarSwatchStyle } from "../../records/[typeId]/components/record-calendar-layout";
import { cn } from "@/core/utils/cn";
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
  const { data, refreshing, failed } = settings;
  const [sourceEditor, setSourceEditor] = useState<{ source: PlannerSource; creating: boolean } | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [eventDetail, setEventDetail] = useState<PlannerEntry | null>(null);
  const [creating, setCreating] = useState<{
    date: CalendarDate;
    minutes: number | null;
    opener: HTMLElement | null;
    rect: DOMRect | null;
  } | null>(null);
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
  const refresh = useCallback(() => settings.load(JSON.parse(fetchKey) as PlannerQuery), [settings, fetchKey]);
  useEffect(() => {
    void refresh().catch(reportApplicationError);
    return settings.cancel;
  }, [refresh, settings]);
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
  const creatableKey = config.sources
    .filter((source) => source.enabled && stores.get(source.id)?.canCreateCalendarRecord)
    .map((source) => source.id)
    .join(",");
  const createIn = useCallback(
    (sourceId: string, date: CalendarDate, minutes: number | null, opener?: HTMLElement | null) => {
      const store = stores.get(sourceId);
      if (store?.canCreateCalendarRecord) store.createCalendarRecord(date, minutes, opener);
    },
    [stores],
  );
  const createAt = useCallback(
    (date: CalendarDate, minutes: number | null, opener?: HTMLElement | null, anchor?: DOMRect) => {
      const ids = creatableKey ? creatableKey.split(",") : [];
      if (ids.length === 1) createIn(ids[0], date, minutes, opener);
      else if (ids.length > 1)
        setCreating({ date, minutes, opener: opener ?? null, rect: anchor ?? opener?.getBoundingClientRect() ?? null });
    },
    [creatableKey, createIn],
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
        create: creatableKey ? createAt : null,
      }),
    [stores, colors, entries, anchor, windowMode, calendarWindow, refreshing, refresh, creatableKey, createAt],
  );
  const dateLabel = (date: string, full = false) =>
    format.date(
      calendarDateInstant(date),
      full ? { dateStyle: "medium", timeZone: UTC } : { month: "long", year: "numeric", timeZone: UTC },
    );
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
  const timelineGroups = [
    ...config.sources
      .filter((source) => source.enabled)
      .map((source) => ({ id: source.id, label: sourceName(source), color: source.color })),
    ...options.calendars
      .filter((calendar) => config.calendarIds.includes(calendar.id))
      .map((calendar) => ({ id: calendar.id, label: calendar.name, color: "secondary" as const })),
  ];
  const anchorParts = calendarDateParts(anchor);
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

          <Popover open={jumping} onOpenChange={setJumping}>
            <h2 aria-live="polite" className="min-w-0">
              <PopoverTrigger asChild>
                <Button className="text-sm font-semibold" data-planner-jump="" size="sm" variant="ghost">
                  {title}
                </Button>
              </PopoverTrigger>
            </h2>

            <PopoverContent align="start" className="w-auto p-0" onOpenAutoFocus={focusCalendarDay}>
              <Calendar
                defaultMonth={new Date(anchorParts.year, anchorParts.month - 1, 1)}
                mode="single"
                selected={new Date(anchorParts.year, anchorParts.month - 1, anchorParts.day)}
                onSelect={(date) => {
                  if (date) setAnchor(calendarDateOf(date.getFullYear(), date.getMonth() + 1, date.getDate()));
                  setJumping(false);
                }}
              />
            </PopoverContent>
          </Popover>

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
        ) : mode === "timeline" || mode === "quarter" ? (
          <PlannerTimeline
            color={colors}
            entries={entries}
            groups={timelineGroups}
            name={name}
            refreshing={refreshing}
            scale={mode === "timeline" ? "day" : "week"}
            store={adapter}
            window={calendarWindow}
            onCreate={(sourceId, date, opener) => createIn(sourceId, date, null, opener)}
            onOpen={open}
          />
        ) : mode === "week" ? (
          <div className="flex min-h-0 flex-1 flex-col" data-planner-week="">
            <div className="max-h-[40dvh] shrink-0 overflow-auto pl-12" data-planner-all-day="">
              <RecordCalendarView
                hideToolbar
                recordName={recordName}
                store={{
                  ...adapter,
                  normalizedCalendarItems: () =>
                    adapter.normalizedCalendarItems?.().filter((item) => showsInAllDayLane(item.entry)) ?? [],
                }}
                onOpenRecord={openRow}
              />
            </div>

            <PlannerWeekSchedule
              color={colors}
              entries={entries}
              name={name}
              refreshing={refreshing}
              store={adapter}
              window={calendarWindow}
              onCreate={creatableKey ? createAt : undefined}
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
              <AppModalTitle className="min-w-0 break-words text-base font-semibold">
                {t("Planner.sources")}
              </AppModalTitle>
            </AppCardHeader>

            <AppCardBody>
              <div className="-mx-1.5 space-y-0.5">
                {config.sources.map((source) => {
                  const menu = (
                    <>
                      <DropdownMenuItem onSelect={() => setSourceEditor({ source, creating: false })}>
                        <Pencil aria-hidden className="size-4" />

                        {t("Planner.sourceSettings")}
                      </DropdownMenuItem>

                      <DropdownMenuItem asChild>
                        <IntlLink href={sourceHref(source)}>
                          <ArrowUpRight aria-hidden className="size-4" />

                          {t("Planner.openList")}
                        </IntlLink>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

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
                  );
                  return (
                    <ItemActions
                      key={source.id}
                      label={t("Planner.sourceActions", { source: sourceName(source) })}
                      menu={menu}
                    >
                      <div
                        className="flex min-w-0 items-center gap-2.5 rounded-md p-1.5 text-sm hover:bg-accent/50"
                        data-planner-source={source.id}
                      >
                        <Checkbox
                          checked={source.enabled}
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

                        <span
                          aria-hidden
                          className="size-2 shrink-0 rounded-full"
                          style={calendarSwatchStyle(source.color)}
                        />

                        <Label
                          className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 leading-snug"
                          htmlFor={`planner-source-${source.id}`}
                        >
                          <span className="w-full truncate">{sourceName(source)}</span>

                          {source.filters.length > 0 && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {t("Planner.filterCount", { count: source.filters.length })}
                            </span>
                          )}
                        </Label>

                        <ItemActionsTrigger />
                      </div>
                    </ItemActions>
                  );
                })}
              </div>

              {config.sources.length === 0 && <p className="text-sm text-muted-foreground">{t("Planner.noSources")}</p>}

              <Button className="self-start" disabled={!canAddSource} size="sm" variant="secondary" onClick={addSource}>
                <Plus aria-hidden className="size-4" />

                {t("Planner.addSource")}
              </Button>

              {options.personalAvailable && (
                <section className="space-y-1.5 border-t pt-4">
                  <h3 className="text-sm font-medium">{t("Planner.personalCalendars")}</h3>

                  {options.calendars.length ? (
                    options.calendars.map((calendar) => {
                      const ProviderIcon = getProviderIcon(calendar.provider);
                      return (
                        <div
                          key={calendar.id}
                          className="-mx-1.5 flex min-w-0 items-center gap-2.5 rounded-md p-1.5 text-sm hover:bg-accent/50"
                        >
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
                            className="min-w-0 flex-1 cursor-pointer leading-snug"
                            htmlFor={`planner-personal-${calendar.id}`}
                          >
                            <span className="truncate">{calendar.name}</span>
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

      {creating && (
        <Popover open onOpenChange={(value) => !value && setCreating(null)}>
          <PopoverAnchor asChild>
            <div
              aria-hidden
              className="pointer-events-none fixed"
              style={{
                left: creating.rect?.left ?? 0,
                top: creating.rect?.top ?? 0,
                width: creating.rect?.width ?? 0,
                height: creating.rect?.height ?? 0,
              }}
            />
          </PopoverAnchor>

          <PopoverContent align="start" className="w-72 p-0" data-planner-create="">
            <PopoverHeader className="px-3 pb-1 pt-3">
              <PopoverTitle>{t("DataView.calendar.createOn", { date: dateLabel(creating.date, true) })}</PopoverTitle>
            </PopoverHeader>

            <div className="flex flex-col gap-0.5 p-1.5">
              {config.sources
                .filter((source) => creatableKey.split(",").includes(source.id))
                .map((source) => (
                  <Button
                    key={source.id}
                    className="justify-start"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreating(null);
                      createIn(source.id, creating.date, creating.minutes, creating.opener);
                    }}
                  >
                    <span aria-hidden className="size-2 rounded-full" style={calendarSwatchStyle(source.color)} />

                    <span className="truncate">{sourceName(source)}</span>
                  </Button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
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
