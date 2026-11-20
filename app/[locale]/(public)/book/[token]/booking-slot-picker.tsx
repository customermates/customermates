"use client";

import type { PublicBookingSlotsResult } from "@/ee/calendar/booking.schema";
import type { BookingSlot } from "./booking-slot-pages";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { bookingHorizonEnd, bookingMonthEnd, loadBookingSlots, needsMoreBookingSlots } from "./booking-slot-pages";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Spinner } from "@/components/ui/spinner";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { calendarDateOf } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";

export type BookingSlotReader = (from: string | undefined) => Promise<PublicBookingSlotsResult>;

export function useBookingSlots(read: BookingSlotReader | null, fixed?: BookingSlot[]) {
  const [fetched, setFetched] = useState<BookingSlot[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const paging = useRef({ loading: false, nextFrom: null as string | null, through: 0, restart: false });

  const load = useCallback(
    async (restart = false) => {
      if (!read) return;
      const state = paging.current;
      if (restart) state.restart = true;
      if (state.loading) return;

      state.loading = true;
      setLoadingMore(true);
      setLoadFailed(false);
      try {
        while (state.restart || needsMoreBookingSlots(state.nextFrom, state.through)) {
          const fresh = state.restart;
          state.restart = false;
          const loaded = await loadBookingSlots({
            read,
            from: fresh ? null : state.nextFrom,
            through: state.through,
            untilFirstSlot: fresh,
          });
          if (loaded.status === "failed") {
            setLoadFailed(true);
            return;
          }
          state.nextFrom = loaded.nextFrom;
          state.through = Math.max(state.through, loaded.through);
          setFetched((current) => (fresh ? loaded.slots : [...(current ?? []), ...loaded.slots]));
        }
      } catch {
        setLoadFailed(true);
      } finally {
        state.loading = false;
        setLoadingMore(false);
      }
    },
    [read],
  );

  useEffect(() => {
    if (read) void load(true).catch(reportApplicationError);
  }, [load, read]);

  const showMonth = useCallback(
    (month: Date) => {
      if (!read) return;
      paging.current.through = Math.max(paging.current.through, bookingMonthEnd(month));
      void load().catch(reportApplicationError);
    },
    [load, read],
  );

  return {
    slots: fixed ?? fetched,
    loadFailed,
    loadingMore,
    reload: () => load(true),
    showMonth,
  };
}

type Props = {
  slots: BookingSlot[];
  timeZone: string;
  horizonDays: number;
  loadingMore: boolean;
  selected: BookingSlot | null;
  onSelect: (slot: BookingSlot | null) => void;
  onMonth: (month: Date) => void;
};

export function BookingSlotPicker({ slots, timeZone, horizonDays, loadingMore, selected, onSelect, onMonth }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [date, setDate] = useState<string | null>(null);
  const [month, setMonth] = useState<Date | null>(null);
  const [openedAt] = useState(() => new Date());

  const byDate = useMemo(() => {
    const groups = new Map<string, BookingSlot[]>();
    for (const item of slots) {
      const key = zonedDate(item.startsAt, timeZone);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  }, [slots, timeZone]);

  const selectedDate = date && byDate.has(date) ? date : byDate.size ? [...byDate.keys()][0] : null;
  const daySlots = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
  const selectedDay = selectedDate
    ? new Date(
        Number(selectedDate.slice(0, 4)),
        Number(selectedDate.slice(5, 7)) - 1,
        Number(selectedDate.slice(8, 10)),
      )
    : undefined;
  const dayHeading = daySlots[0]
    ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone }).format(
        new Date(daySlots[0].startsAt),
      )
    : null;
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));

  return (
    <div className="grid gap-6 @2xl/booking:grid-cols-[auto_minmax(9rem,1fr)]">
      <div aria-busy={loadingMore} className="flex flex-col items-start gap-2" data-booking-calendar="">
        <Calendar
          disabled={(day) => !byDate.has(calendarDateOf(day.getFullYear(), day.getMonth() + 1, day.getDate()))}
          endMonth={bookingHorizonEnd(openedAt, horizonDays)}
          mode="single"
          month={month ?? selectedDay ?? openedAt}
          selected={selectedDay}
          startMonth={openedAt}
          onMonthChange={(next) => {
            setMonth(next);
            onMonth(next);
          }}
          onSelect={(day) => {
            if (!day) return;
            setDate(calendarDateOf(day.getFullYear(), day.getMonth() + 1, day.getDate()));
            onSelect(null);
          }}
        />

        <p className="text-xs text-muted-foreground">{t("PublicBooking.timeZone", { timeZone })}</p>

        {loadingMore ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Spinner aria-hidden aria-label={t("PublicBooking.loadingMore")} className="size-3" />

            {t("PublicBooking.loadingMore")}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3" data-booking-slots="">
        {dayHeading ? <h2 className="text-sm font-medium">{dayHeading}</h2> : null}

        <div className="grid grid-cols-3 gap-2 @2xl/booking:max-h-80 @2xl/booking:grid-cols-1 @2xl/booking:overflow-y-auto @2xl/booking:pr-1">
          {daySlots.map((item) => (
            <Button
              key={item.startsAt}
              aria-pressed={selected?.startsAt === item.startsAt}
              className="w-full tabular-nums"
              type="button"
              variant={selected?.startsAt === item.startsAt ? "default" : "secondary"}
              onClick={() => onSelect(item)}
            >
              {timeLabel(item.startsAt)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
