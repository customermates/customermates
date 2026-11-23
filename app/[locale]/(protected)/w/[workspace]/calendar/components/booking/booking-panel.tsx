"use client";

import type { UpcomingBookingDto, WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingPanelState } from "./booking-panel-model";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";

import { deleteBookingLinkAction, saveBookingLinkAction } from "../../booking-actions";
import { PlannerSidePanel } from "../planner-side-panel";

import { ConnectChannelButton } from "@/components/channels/connect-channel-menu";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRouter } from "@/i18n/navigation";

import { BookingPageRow } from "./booking-page-row";
import { canCreateBookingPage } from "./booking-panel-model";
import { BookingPanelStore } from "./booking-panel.store";
import { BookingUpcomingList } from "./booking-upcoming-list";

type Props = { state: BookingPanelState; onClose: () => void };

const NO_LINKS: WorkspaceBookingLinkDto[] = [];

const NO_BOOKINGS: UpcomingBookingDto[] = [];

export const BookingPanel = observer(function BookingPanel({ state, onClose }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const modal = useRootStore().bookingLinkModalStore;
  const ready = state.status === "ready" ? state : null;
  const readOnly = Boolean(ready?.readOnly);
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
  const [now] = useState(() => new Date());
  const links = ready?.links ?? NO_LINKS;
  const upcoming = ready?.upcoming ?? NO_BOOKINGS;
  const setup = ready?.setup ?? null;
  const hostCandidates = ready?.hostCandidates;

  useEffect(() => store.sync(links), [store, links]);
  useEffect(() => {
    if (setup) modal.configure(setup, actions.refresh, hostCandidates, readOnly);
  }, [modal, setup, actions, hostCandidates, readOnly]);

  const { groups } = store;
  const canCreate = canCreateBookingPage(state);
  const showOwners = groups.others.length > 0;
  const edit = (link: WorkspaceBookingLinkDto, invoker: HTMLElement | null) => modal.start(link, invoker);
  const notes = [
    state.status === "unavailable" ? (
      <Alert
        key="unavailable"
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
    ) : null,
    readOnly ? (
      <Alert
        key="readOnly"
        data-booking-read-only=""
        description={t("Booking.demoNote")}
        role="status"
        variant="info"
      />
    ) : null,
    !readOnly && ready?.setup.blockedReason === "noCalendar" ? (
      <Alert
        key="noCalendar"
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
    ) : null,
    !readOnly && ready?.setup.blockedReason === "needsReconnect" ? (
      <Alert
        key="needsReconnect"
        description={t("ScheduleMeeting.blocked.needsReconnect")}
        role="status"
        variant="warning"
      />
    ) : null,
    ready?.busyTimeIncomplete ? (
      <Alert
        key="busyTime"
        data-booking-busy-incomplete=""
        description={t("Booking.busyTimeIncomplete")}
        role="status"
        variant="warning"
      />
    ) : null,
  ].filter(Boolean);

  return (
    <PlannerSidePanel
      actions={
        <Button data-booking-new="" disabled={!canCreate} size="sm" onClick={() => modal.start()}>
          <Plus aria-hidden className="size-4" />

          {t("Booking.newShort")}
        </Button>
      }
      data-booking-panel=""
      title={t("Booking.panelTitle")}
      onClose={onClose}
    >
      {notes.length > 0 ? <div className="flex flex-col gap-3 px-5 pt-4 pb-1">{notes}</div> : null}

      {ready && store.links.length === 0 ? (
        <div className="p-5">
          <PageState
            action={
              <Button disabled={!canCreate} variant="secondary" onClick={() => modal.start()}>
                {t("Booking.new")}
              </Button>
            }
            description={t("Booking.description")}
            state="empty"
            title={t("Booking.empty")}
          />
        </div>
      ) : null}

      {groups.own.length > 0 ? (
        <section className="flex flex-col" data-booking-group="own">
          {showOwners ? (
            <h3 className="px-5 pt-4 pb-1 text-xs font-semibold text-muted-foreground">{t("Booking.panelYours")}</h3>
          ) : null}

          <ul className="flex flex-col">
            {groups.own.map((link) => (
              <BookingPageRow key={link.id} link={link} readOnly={readOnly} store={store} onEdit={edit} />
            ))}
          </ul>
        </section>
      ) : null}

      {groups.others.map((group) => (
        <section key={group.ownerName} className="flex flex-col border-t" data-booking-group="owner">
          <h3 className="px-5 pt-4 pb-1 text-xs font-semibold text-muted-foreground">
            {t("Booking.panelOwner", { owner: group.ownerName })}
          </h3>

          <ul className="flex flex-col">
            {group.links.map((link) => (
              <BookingPageRow key={link.id} link={link} readOnly={readOnly} store={store} onEdit={edit} />
            ))}
          </ul>
        </section>
      ))}

      {ready && store.links.length > 0 ? (
        <BookingUpcomingList
          bookings={upcoming}
          links={store.links}
          now={now}
          readOnly={readOnly}
          onChanged={actions.refresh}
        />
      ) : null}
    </PlannerSidePanel>
  );
});
