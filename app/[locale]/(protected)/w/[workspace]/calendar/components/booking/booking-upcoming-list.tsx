"use client";

import type { UpcomingBookingDto, WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ItemActions } from "@/components/ui/item-actions";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { BookingHostActions } from "./booking-host-actions";
import { groupUpcomingByDay } from "./booking-panel-model";

type Props = {
  bookings: readonly UpcomingBookingDto[];
  links: readonly WorkspaceBookingLinkDto[];
  now: Date;
  readOnly: boolean;
  onChanged: () => void;
};

const DEFAULT_HORIZON_DAYS = 30;

export function BookingUpcomingList({ bookings, links, now, readOnly, onChanged }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const days = useMemo(() => groupUpcomingByDay(bookings, now), [bookings, now]);
  const linkOf = useMemo(() => new Map(links.map((link) => [link.id, link])), [links]);
  const time = (iso: string) => intlStore.formatTime(new Date(iso));

  return (
    <section className="flex flex-col border-t bg-muted/30 pb-2" data-booking-upcoming="">
      <div className="flex items-center justify-between gap-2 px-6 pt-3">
        <h3 className="text-sm font-semibold">{t("Booking.upcomingTitle")}</h3>

        <Badge variant="secondary">{bookings.length}</Badge>
      </div>

      {days.length === 0 ? (
        <p className="px-6 py-3 text-xs text-muted-foreground">{t("Booking.upcoming", { count: 0 })}</p>
      ) : null}

      {days.map((day) => (
        <div key={day.key} className="flex flex-col" data-booking-upcoming-day={day.key}>
          <h4 className="px-6 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">
            {day.relative === "today"
              ? t("Booking.today")
              : day.relative === "tomorrow"
                ? t("Booking.tomorrow")
                : intlStore.formatDayMonth(day.day)}
          </h4>

          <ul className="flex flex-col">
            {day.bookings.map((booking) => {
              const link = linkOf.get(booking.bookingLinkId);
              const team = Boolean(link && link.hosts.length > 0);
              return (
                <ItemActions key={booking.id} label={t("Booking.hostActions.menu", { name: booking.inviteeName })}>
                  <li
                    className="flex items-center gap-3 px-6 py-2 hover:bg-accent/50"
                    data-booking-upcoming-item={booking.id}
                  >
                    <Avatar name={booking.inviteeName} size="lg" />

                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{booking.inviteeName}</span>

                      <span className="truncate text-xs text-muted-foreground">
                        {team ? `${booking.pageTitle} · ${booking.hostName}` : booking.pageTitle}
                      </span>
                    </div>

                    <span className="shrink-0 text-xs tabular-nums">
                      {`${time(booking.startsAt)} – ${time(booking.endsAt)}`}
                    </span>

                    <BookingHostActions
                      booking={booking}
                      disabled={readOnly}
                      horizonDays={link?.horizonDays ?? DEFAULT_HORIZON_DAYS}
                      onChanged={onChanged}
                    />
                  </li>
                </ItemActions>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
