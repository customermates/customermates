"use client";

import type { BookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingSetup } from "@/ee/calendar/booking-setup";

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";

import { deleteBookingLinkAction } from "../booking/actions";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AppChip } from "@/components/chip/app-chip";
import { ConnectChannelButton } from "@/components/channels/connect-channel-menu";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { CopyableCode } from "@/components/shared/copyable-code";
import { TopBarActionButtons } from "@/components/shared/top-bar-action-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { IntlLink, useRouter } from "@/i18n/navigation";

type Props = {
  links: BookingLinkDto[];
  setup: BookingSetup;
  locked?: boolean;
  unavailable?: "demo" | "selfHosted";
};

const BookingLinksPageViewContent = observer(function BookingLinksPageView({
  links,
  setup,
  locked,
  unavailable,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const root = useRootStore();
  const store = root.bookingLinkModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const refresh = useMemo(() => () => router.refresh(), [router]);
  const disabled = Boolean(locked || unavailable || setup.blockedReason);

  useEffect(() => {
    store.configure(setup, refresh);
  }, [store, setup, refresh]);

  const topBarActions = useMemo(
    () => (
      <TopBarActionButtons
        actions={[
          {
            id: "booking-new",
            icon: Plus,
            label: t("Booking.new"),
            disabled,
            onClick: () => store.start(),
          },
        ]}
      />
    ),
    [t, disabled, store],
  );
  useSetTopBarActions(topBarActions);

  return (
    <div className="flex flex-col gap-4" data-booking-page="">
      <p className="text-sm text-muted-foreground">{t("Booking.description")}</p>

      {unavailable ? (
        <Alert
          description={unavailable === "demo" ? t("Booking.demoNote") : t("Booking.selfHostedNote")}
          role="status"
          variant="info"
        />
      ) : null}

      {!unavailable && !locked && setup.blockedReason === "noCalendar" ? (
        <Alert
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

      {!unavailable && !locked && setup.blockedReason === "needsReconnect" ? (
        <Alert description={t("ScheduleMeeting.blocked.needsReconnect")} role="status" variant="warning" />
      ) : null}

      {links.length === 0 ? (
        <PageState
          action={
            <Button disabled={disabled} variant="secondary" onClick={() => store.start()}>
              {t("Booking.new")}
            </Button>
          }
          state="empty"
          title={t("Booking.empty")}
        />
      ) : (
        <div className="grid gap-3">
          {links.map((link) => (
            <Card key={link.id} data-booking-link={link.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarClock aria-hidden className="size-4 text-muted-foreground" />

                  <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{link.title}</h2>

                  <AppChip>{t("Booking.minutes", { minutes: link.durationMinutes })}</AppChip>

                  {!link.enabled ? <AppChip variant="outline">{t("Booking.paused")}</AppChip> : null}
                </div>

                <p className="text-sm text-muted-foreground">
                  {t("Booking.upcoming", { count: link.upcomingBookings })}
                </p>

                <CopyableCode value={link.url} />

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={(event) => store.start(link, event.currentTarget)}>
                    <Pencil aria-hidden className="size-4" />

                    {t("Booking.edit")}
                  </Button>

                  <Button asChild size="sm" variant="secondary">
                    <IntlLink href={link.url.replace(/^https?:\/\/[^/]+/u, "")} target="_blank">
                      <ArrowUpRight aria-hidden className="size-4" />

                      {t("Booking.open")}
                    </IntlLink>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghostDestructive"
                    onClick={() =>
                      showDeleteConfirmation(async () => {
                        const result = await deleteBookingLinkAction({ id: link.id });
                        if (result.ok) refresh();
                        return result.ok;
                      }, link.title)
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />

                    {t("Common.actions.delete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
});

export const BookingLinksPageView = serverRenderedClient(BookingLinksPageViewContent);
