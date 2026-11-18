"use client";

import type { UpcomingBookingDto, WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingPanelState } from "./booking-panel-model";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, CalendarClock, Pencil, Plus, Trash2, X } from "lucide-react";

import { deleteBookingLinkAction, saveBookingLinkAction } from "../../booking-actions";

import { AppChip } from "@/components/chip/app-chip";
import { ConnectChannelButton } from "@/components/channels/connect-channel-menu";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { IntlLink, useRouter } from "@/i18n/navigation";

import { bookingPublicPath, canCreateBookingPage } from "./booking-panel-model";
import { BookingPanelStore } from "./booking-panel.store";

type Props = {
  state: BookingPanelState;
  onClose: () => void;
};

const NO_LINKS: WorkspaceBookingLinkDto[] = [];

const NO_BOOKINGS: UpcomingBookingDto[] = [];
const UPCOMING_PER_PAGE = 5;

const BookingRow = observer(function BookingRow({
  link,
  store,
  upcoming,
  onEdit,
}: {
  link: WorkspaceBookingLinkDto;
  store: BookingPanelStore;
  upcoming: UpcomingBookingDto[];
  onEdit: (link: WorkspaceBookingLinkDto, invoker: HTMLElement) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
      new Date(iso),
    );
  const { showDeleteConfirmation } = useDeleteConfirmation();

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3" data-booking-link={link.id}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{link.title}</h3>

        {link.assignment === "roundRobin" && link.hosts.length > 0 ? (
          <AppChip data-booking-round-robin="">{t("Booking.roundRobinChip", { count: link.hosts.length + 1 })}</AppChip>
        ) : null}

        <AppChip>{t("Booking.minutes", { minutes: link.durationMinutes })}</AppChip>
      </div>

      <p className="text-xs text-muted-foreground">{t("Booking.upcoming", { count: link.upcomingBookings })}</p>

      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-1" data-booking-upcoming="">
          {upcoming.slice(0, UPCOMING_PER_PAGE).map((booking) => (
            <li key={booking.id} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 tabular-nums text-muted-foreground">{when(booking.startsAt)}</span>

              <span className="min-w-0 flex-1 truncate">{booking.inviteeName}</span>

              {link.hosts.length > 0 ? (
                <span className="shrink-0 text-muted-foreground">{booking.hostName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {link.calendarId === null ? (
        <Alert
          action={
            link.own ? (
              <Button size="sm" variant="secondary" onClick={(event) => onEdit(link, event.currentTarget)}>
                {t("Booking.chooseCalendar")}
              </Button>
            ) : undefined
          }
          data-booking-calendar-missing=""
          description={t("Booking.noCalendar")}
          role="status"
          variant="warning"
        />
      ) : null}

      <CopyableCode value={link.url} />

      <div className="flex flex-wrap items-center gap-2">
        <Switch
          aria-label={t("Booking.fields.enabled")}
          checked={link.enabled}
          disabled={!link.own || store.pending.has(link.id)}
          id={`booking-enabled-${link.id}`}
          onCheckedChange={(next) => runUserAction(() => store.toggle(link.id, next))}
        />

        <span className="text-xs text-muted-foreground">
          {link.calendarId === null
            ? t("Booking.panelUnavailable")
            : link.enabled
              ? t("Booking.panelActive")
              : t("Booking.paused")}
        </span>

        <div className="ml-auto flex items-center gap-1">
          {link.own ? (
            <Button size="sm" variant="secondary" onClick={(event) => onEdit(link, event.currentTarget)}>
              <Pencil aria-hidden className="size-4" />

              {t("Booking.edit")}
            </Button>
          ) : null}

          <Button asChild size="sm" variant="secondary">
            <IntlLink href={bookingPublicPath(link.url)} target="_blank">
              <ArrowUpRight aria-hidden className="size-4" />

              {t("Booking.open")}
            </IntlLink>
          </Button>

          {link.own ? (
            <Button
              size="sm"
              variant="ghostDestructive"
              onClick={() => showDeleteConfirmation(() => store.remove(link.id), link.title)}
            >
              <Trash2 aria-hidden className="size-4" />

              {t("Common.actions.delete")}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
});

export const BookingPanel = observer(function BookingPanel({ state, onClose }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const modal = useRootStore().bookingLinkModalStore;
  const ready = state.status === "ready" ? state : null;
  const actions = useMemo(
    () => ({
      setEnabled: async (id: string, enabled: boolean) => {
        const result = await saveBookingLinkAction({ id, enabled });
        if (!result.ok) toastZodErrorTree(result.error);
        return result.ok;
      },
      remove: async (id: string) => {
        const result = await deleteBookingLinkAction({ id });
        if (!result.ok) toastZodErrorTree(result.error);
        return result.ok;
      },
      refresh: () => router.refresh(),
    }),
    [router],
  );
  const [store] = useState(() => new BookingPanelStore(ready?.links ?? NO_LINKS, actions));
  const links = ready?.links ?? NO_LINKS;
  const setup = ready?.setup ?? null;
  const hostCandidates = ready?.hostCandidates;
  const upcomingByLink = useMemo(() => {
    const groups = new Map<string, UpcomingBookingDto[]>();
    for (const booking of ready?.upcoming ?? NO_BOOKINGS)
      groups.set(booking.bookingLinkId, [...(groups.get(booking.bookingLinkId) ?? []), booking]);
    return groups;
  }, [ready]);

  useEffect(() => store.sync(links), [store, links]);
  useEffect(() => {
    if (setup) modal.configure(setup, actions.refresh, hostCandidates);
  }, [modal, setup, actions, hostCandidates]);

  const { groups } = store;
  const canCreate = canCreateBookingPage(state);
  const showOwners = groups.others.length > 0;

  return (
    <aside
      aria-label={t("Booking.panelTitle")}
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l bg-background shadow-lg"
      data-booking-panel=""
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <CalendarClock aria-hidden className="size-4 shrink-0 text-muted-foreground" />

        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t("Booking.panelTitle")}</h2>

        <Button disabled={!canCreate} size="sm" variant="secondary" onClick={() => modal.start()}>
          <Plus aria-hidden className="size-4" />

          {t("Booking.new")}
        </Button>

        <IconButton icon={X} label={t("Booking.panelClose")} onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <p className="text-xs text-muted-foreground">{t("Booking.description")}</p>

        {state.status === "unavailable" ? (
          <Alert
            description={
              state.reason === "demo"
                ? t("Booking.demoNote")
                : state.reason === "selfHosted"
                  ? t("Booking.selfHostedNote")
                  : t("Booking.panelLocked")
            }
            role="status"
            variant="info"
          />
        ) : null}

        {state.status === "ready" && state.setup.blockedReason === "noCalendar" ? (
          <Alert
            stacked
            action={
              <ConnectChannelButton
                channels={["google", "outlook"]}
                id="booking-connect-calendar"
                label={t("Planner.connectCalendar")}
              />
            }
            description={t("ScheduleMeeting.blocked.noCalendar")}
            role="status"
            variant="warning"
          />
        ) : null}

        {state.status === "ready" && state.setup.blockedReason === "needsReconnect" ? (
          <Alert description={t("ScheduleMeeting.blocked.needsReconnect")} role="status" variant="warning" />
        ) : null}

        {state.status === "ready" && state.busyTimeIncomplete ? (
          <Alert
            data-booking-busy-incomplete=""
            description={t("Booking.busyTimeIncomplete")}
            role="status"
            variant="warning"
          />
        ) : null}

        {state.status === "ready" && store.links.length === 0 ? (
          <PageState
            action={
              <Button disabled={!canCreate} variant="secondary" onClick={() => modal.start()}>
                {t("Booking.new")}
              </Button>
            }
            state="empty"
            title={t("Booking.empty")}
          />
        ) : null}

        {groups.own.length > 0 ? (
          <section className="flex flex-col gap-2" data-booking-group="own">
            {showOwners ? (
              <h3 className="text-xs font-semibold text-muted-foreground">{t("Booking.panelYours")}</h3>
            ) : null}

            <ul className="flex flex-col gap-2">
              {groups.own.map((link) => (
                <BookingRow
                  key={link.id}
                  link={link}
                  store={store}
                  upcoming={upcomingByLink.get(link.id) ?? NO_BOOKINGS}
                  onEdit={(item, invoker) => modal.start(item, invoker)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {groups.others.map((group) => (
          <section key={group.ownerName} className="flex flex-col gap-2" data-booking-group="owner">
            <h3 className="text-xs font-semibold text-muted-foreground">
              {t("Booking.panelOwner", { owner: group.ownerName })}
            </h3>

            <ul className="flex flex-col gap-2">
              {group.links.map((link) => (
                <BookingRow
                  key={link.id}
                  link={link}
                  store={store}
                  upcoming={upcomingByLink.get(link.id) ?? NO_BOOKINGS}
                  onEdit={(item, invoker) => modal.start(item, invoker)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
});
