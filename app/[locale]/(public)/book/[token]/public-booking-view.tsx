"use client";

import type { FormEvent } from "react";
import type { PublicBookingPage, PublicBookingSubmitResult } from "@/ee/calendar/booking.schema";
import type { FormValue } from "@/components/public-form/public-form-state";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarCheck, Clock, Video } from "lucide-react";

import { readPublicBookingSlotsAction, submitPublicBookingAction } from "./actions";
import { bookingHorizonEnd, bookingMonthEnd, loadBookingSlots, needsMoreBookingSlots } from "./booking-slot-pages";

import { PublicFormFieldInput } from "@/components/public-form/public-form-field-input";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { browserTimeZone } from "@/core/utils/time-zone";
import { calendarDateOf } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";

type Slot = { startsAt: string; endsAt: string };
type Confirmed = Extract<PublicBookingSubmitResult, { status: "booked" }>;

export type PublicBookingPreview = { slots: Slot[]; timeZone: string };

const SLOT_DAYS = 31;

function Frame({ children, preview = false }: { children: React.ReactNode; preview?: boolean }) {
  return (
    <div
      className={preview ? "w-full bg-background" : "min-h-full w-full bg-background"}
      data-booking-preview={preview ? "" : undefined}
      id={preview ? undefined : "public-booking"}
    >
      <main
        className={
          preview
            ? "mx-auto flex w-full max-w-3xl flex-col gap-4 p-4"
            : "mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 md:px-8 md:py-10"
        }
      >
        {children}
      </main>
    </div>
  );
}

function SlotForm({
  readOnly,
  onSubmit,
  children,
}: {
  readOnly: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  if (readOnly) {
    return (
      <div className="flex flex-col gap-4" data-booking-form="">
        {children}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" data-booking-form="" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export function PublicBookingUnavailable({ rateLimited }: { rateLimited: boolean }) {
  const t = useTranslations();

  return (
    <Frame>
      <Alert
        description={rateLimited ? t("PublicBooking.rateLimited") : t("PublicBooking.unavailable")}
        role="status"
        variant="warning"
      />
    </Frame>
  );
}

export function PublicBookingView({
  page,
  token,
  preview,
}: {
  page: PublicBookingPage;
  token: string;
  preview?: PublicBookingPreview;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [visitorTimeZone, setTimeZone] = useState<string | null>(null);
  const [fetchedSlots, setSlots] = useState<Slot[] | null>(null);
  const slots = preview ? preview.slots : fetchedSlots;
  const timeZone = preview ? preview.timeZone : visitorTimeZone;
  const readOnly = preview !== undefined;
  const [loadFailed, setLoadFailed] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [answers, setAnswers] = useState<Record<string, FormValue>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<"slotTaken" | "unavailable" | "rateLimited" | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  const [month, setMonth] = useState<Date | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openedAt] = useState(() => new Date());
  const paging = useRef({ loading: false, nextFrom: null as string | null, through: 0, restart: false });

  useEffect(() => setTimeZone(browserTimeZone()), []);

  const loadSlots = useCallback(
    async (restart = false) => {
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
            read: (from) => readPublicBookingSlotsAction({ token, days: SLOT_DAYS, ...(from ? { from } : {}) }),
            from: fresh ? null : state.nextFrom,
            through: state.through,
            untilFirstSlot: fresh,
          });
          if (loaded.status === "failed") {
            setLoadFailed(true);
            return;
          }
          state.nextFrom = loaded.nextFrom;
          setSlots((current) => (fresh ? loaded.slots : [...(current ?? []), ...loaded.slots]));
        }
      } catch {
        setLoadFailed(true);
      } finally {
        state.loading = false;
        setLoadingMore(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!readOnly) void loadSlots(true).catch(reportApplicationError);
  }, [loadSlots, readOnly]);

  const showMonth = (next: Date) => {
    setMonth(next);
    if (readOnly) return;
    paging.current.through = Math.max(paging.current.through, bookingMonthEnd(next));
    void loadSlots().catch(reportApplicationError);
  };

  const byDate = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    if (!timeZone) return groups;
    for (const item of slots ?? []) {
      const key = zonedDate(item.startsAt, timeZone);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  }, [slots, timeZone]);

  const dayLabel = useMemo(
    () => (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: timeZone ?? "UTC" }).format(
        new Date(iso),
      ),
    [locale, timeZone],
  );
  const timeLabel = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? "UTC" }).format(
      new Date(iso),
    );

  const selectedDate = date ?? (byDate.size ? [...byDate.keys()][0] : null);
  const daySlots = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
  const selectedDay = selectedDate
    ? new Date(
        Number(selectedDate.slice(0, 4)),
        Number(selectedDate.slice(5, 7)) - 1,
        Number(selectedDate.slice(8, 10)),
      )
    : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot || !timeZone || submitting || readOnly) return;

    setSubmitting(true);
    setProblem(null);
    setInvalid([]);
    try {
      const result = await submitPublicBookingAction({
        token,
        startsAt: slot.startsAt,
        name,
        email,
        timeZone,
        answers,
        website,
        renderToken: page.renderToken,
      });
      if (result.status === "booked") setConfirmed(result);
      else if (result.status === "invalid") setInvalid(result.fields);
      else {
        setProblem(result.status);
        if (result.status === "slotTaken") {
          setSlot(null);
          await loadSlots(true);
        }
      }
    } catch {
      setProblem("unavailable");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <Frame>
        <div className="flex flex-col gap-3" data-booking-confirmed="">
          <CalendarCheck aria-hidden className="size-8 text-success" />

          <h1 className="text-2xl font-semibold tracking-tight">{t("PublicBooking.confirmedTitle")}</h1>

          <p className="text-sm">{confirmed.title}</p>

          <p className="text-sm text-muted-foreground">{dayLabel(confirmed.startsAt)}</p>

          {confirmed.conferenceUrl ? (
            <a
              className="text-sm text-primary underline"
              href={confirmed.conferenceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("PublicBooking.joinLink")}
            </a>
          ) : null}

          <p className="text-sm text-muted-foreground">
            {confirmed.successMessage ?? t("PublicBooking.confirmedText")}
          </p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame preview={readOnly}>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {page.workspaceName ? `${page.hostName} · ${page.workspaceName}` : page.hostName}
        </p>

        <h1 className="text-2xl font-semibold tracking-tight" id="public-booking-title">
          {page.title}
        </h1>

        <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock aria-hidden className="size-4" />

            {t("PublicBooking.minutes", { minutes: page.durationMinutes })}
          </span>

          {page.withVideo ? (
            <span className="flex items-center gap-1">
              <Video aria-hidden className="size-4" />

              {t("PublicBooking.video")}
            </span>
          ) : null}
        </p>

        {page.description ? <p className="whitespace-pre-line text-sm">{page.description}</p> : null}
      </div>

      {loadFailed ? <Alert description={t("PublicBooking.loadFailed")} role="alert" variant="destructive" /> : null}

      {problem ? (
        <Alert
          description={
            problem === "slotTaken"
              ? t("PublicBooking.problem.slotTaken")
              : problem === "rateLimited"
                ? t("PublicBooking.problem.rateLimited")
                : t("PublicBooking.problem.unavailable")
          }
          role="alert"
          variant="warning"
        />
      ) : null}

      {slots === null && !loadFailed ? (
        <div className="flex justify-center py-8">
          <Spinner aria-label={t("Loading.text")} className="size-5" />
        </div>
      ) : null}

      {slots && !slots.length && !loadFailed ? (
        <p className="text-sm text-muted-foreground">{t("PublicBooking.noSlots")}</p>
      ) : null}

      {slots?.length && timeZone ? (
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div aria-busy={loadingMore} className="flex flex-col gap-2" data-booking-calendar="">
            <Calendar
              disabled={(day) => !byDate.has(calendarDateOf(day.getFullYear(), day.getMonth() + 1, day.getDate()))}
              endMonth={bookingHorizonEnd(openedAt, page.horizonDays)}
              mode="single"
              month={month ?? selectedDay ?? openedAt}
              selected={selectedDay}
              startMonth={openedAt}
              onMonthChange={showMonth}
              onSelect={(day) => {
                if (!day) return;
                setDate(calendarDateOf(day.getFullYear(), day.getMonth() + 1, day.getDate()));
                setSlot(null);
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

          <div className="flex flex-col gap-2" data-booking-slots="">
            <div className="flex flex-wrap gap-2">
              {daySlots.map((item) => (
                <Button
                  key={item.startsAt}
                  size="sm"
                  type="button"
                  variant={slot?.startsAt === item.startsAt ? "default" : "secondary"}
                  onClick={() => setSlot(item)}
                >
                  {timeLabel(item.startsAt)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {slot ? (
        <SlotForm readOnly={readOnly} onSubmit={(event) => runUserAction(() => submit(event))}>
          <p className="text-sm font-medium">{dayLabel(slot.startsAt)}</p>

          <div className="space-y-1.5">
            <Label htmlFor="booking-name">
              {t("PublicBooking.name")}

              <span className="text-destructive"> *</span>
            </Label>

            <Input
              required
              aria-invalid={invalid.includes("name")}
              autoComplete="name"
              disabled={readOnly}
              id="booking-name"
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="booking-email">
              {t("PublicBooking.email")}

              <span className="text-destructive"> *</span>
            </Label>

            <Input
              required
              aria-invalid={invalid.includes("email")}
              autoComplete="email"
              disabled={readOnly}
              id="booking-email"
              maxLength={320}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {page.questions.map((question) => (
            <PublicFormFieldInput
              key={question.fieldId}
              disabled={submitting || readOnly}
              error={invalid.includes(question.fieldId) ? "invalid" : undefined}
              field={question}
              value={answers[question.fieldId]}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.fieldId]: value }))}
            />
          ))}

          <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
            <label htmlFor="booking-website">{t("PublicBooking.honeypot")}</label>

            <input
              autoComplete="off"
              id="booking-website"
              name="website"
              tabIndex={-1}
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          <Button disabled={submitting || readOnly} type="submit">
            {submitting ? <Spinner aria-label={t("Loading.text")} className="size-4" /> : null}

            {t("PublicBooking.confirm")}
          </Button>
        </SlotForm>
      ) : null}
    </Frame>
  );
}
