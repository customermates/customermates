"use client";

import type { FormEvent } from "react";
import type { PublicBookingPage, PublicBookingSubmitResult } from "@/ee/calendar/booking.schema";
import type { FormValue } from "@/components/public-form/public-form-state";
import type { BookingSlot } from "./booking-slot-pages";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CalendarCheck, CalendarDays, Clock, Video } from "lucide-react";

import { readPublicBookingSlotsAction, submitPublicBookingAction } from "./actions";
import { type BookingSlotReader, BookingSlotPicker, useBookingSlots } from "./booking-slot-picker";

import { PublicFormFieldInput } from "@/components/public-form/public-form-field-input";
import { Alert } from "@/components/shared/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { browserTimeZone } from "@/core/utils/time-zone";

type Confirmed = Extract<PublicBookingSubmitResult, { status: "booked" }>;

export type PublicBookingPreview = { slots: BookingSlot[]; timeZone: string };

const SLOT_DAYS = 31;

export function PublicBookingFrame({
  children,
  aside,
  preview = false,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  preview?: boolean;
}) {
  return (
    <div
      className={
        preview
          ? "@container/booking w-full bg-background"
          : "@container/booking flex min-h-full w-full items-start justify-center bg-muted/40 px-4 py-6 md:py-12"
      }
      data-booking-preview={preview ? "" : undefined}
      id={preview ? undefined : "public-booking"}
    >
      <main
        className={
          aside
            ? "grid w-full max-w-4xl overflow-hidden rounded-xl border bg-background shadow-sm @3xl/booking:grid-cols-[17rem_1fr]"
            : "w-full max-w-xl overflow-hidden rounded-xl border bg-background shadow-sm"
        }
      >
        {aside ? (
          <aside className="flex flex-col gap-3 border-b p-5 @3xl/booking:border-b-0 @3xl/booking:border-r @3xl/booking:p-6">
            {aside}
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-col gap-5 p-5 @3xl/booking:p-6">{children}</div>
      </main>
    </div>
  );
}

export function useBookingWhen(timeZone: string | null) {
  const locale = useLocale();

  return useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: timeZone ?? "UTC" }).format(
        new Date(iso),
      ),
    [locale, timeZone],
  );
}

export function BookingSummary({
  hostName,
  workspaceName,
  team = false,
  title,
  durationMinutes,
  withVideo = false,
  when,
  description,
}: {
  hostName: string;
  workspaceName: string | null;
  team?: boolean;
  title: string;
  durationMinutes: number;
  withVideo?: boolean;
  when?: string | null;
  description?: string | null;
}) {
  const t = useTranslations();
  const who = team ? (workspaceName ?? hostName) : hostName;

  return (
    <>
      <div className="flex items-start gap-2">
        <Avatar className="mt-0.5 shrink-0" name={who} size="sm" />

        <p className="min-w-0 text-sm text-muted-foreground">
          {!team && workspaceName ? `${hostName} · ${workspaceName}` : who}
        </p>
      </div>

      <h1 className="text-xl font-semibold tracking-tight" id="public-booking-title">
        {title}
      </h1>

      <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
        <li className="flex items-center gap-2">
          <Clock aria-hidden className="size-4 shrink-0" />

          {t("PublicBooking.minutes", { minutes: durationMinutes })}
        </li>

        {withVideo ? (
          <li className="flex items-center gap-2">
            <Video aria-hidden className="size-4 shrink-0" />

            {t("PublicBooking.video")}
          </li>
        ) : null}

        {when ? (
          <li className="flex items-start gap-2 text-foreground" data-booking-when="">
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0" />

            {when}
          </li>
        ) : null}
      </ul>

      {description ? <p className="whitespace-pre-line text-sm">{description}</p> : null}
    </>
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
    <PublicBookingFrame>
      <Alert
        description={rateLimited ? t("PublicBooking.rateLimited") : t("PublicBooking.unavailable")}
        role="status"
        variant="warning"
      />
    </PublicBookingFrame>
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
  const readOnly = preview !== undefined;
  const [visitorTimeZone, setTimeZone] = useState<string | null>(null);
  const timeZone = preview ? preview.timeZone : visitorTimeZone;
  const read = useCallback<BookingSlotReader>(
    (from) => readPublicBookingSlotsAction({ token, days: SLOT_DAYS, ...(from ? { from } : {}) }),
    [token],
  );
  const { slots, loadFailed, loadingMore, reload, showMonth } = useBookingSlots(readOnly ? null : read, preview?.slots);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [answers, setAnswers] = useState<Record<string, FormValue>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<"slotTaken" | "unavailable" | "rateLimited" | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const when = useBookingWhen(timeZone);

  useEffect(() => setTimeZone(browserTimeZone()), []);

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
          await reload();
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
      <PublicBookingFrame>
        <div className="flex flex-col gap-4" data-booking-confirmed="">
          <CalendarCheck aria-hidden className="size-8 text-success" />

          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">{t("PublicBooking.confirmedTitle")}</h1>

            <p className="text-sm text-muted-foreground">
              {confirmed.successMessage ?? t("PublicBooking.confirmedText")}
            </p>
          </div>

          <dl className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
            <dt className="font-medium">{confirmed.title}</dt>

            <dd className="text-muted-foreground">{when(confirmed.startsAt)}</dd>

            <dd className="text-muted-foreground">{t("PublicBooking.with", { host: confirmed.hostName })}</dd>

            {confirmed.conferenceUrl ? (
              <dd>
                <a
                  className="text-primary underline"
                  href={confirmed.conferenceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("PublicBooking.joinLink")}
                </a>
              </dd>
            ) : null}
          </dl>

          {confirmed.manageUrl ? (
            <div>
              <Button asChild size="sm" variant="secondary">
                <a data-booking-manage-link="" href={confirmed.manageUrl}>
                  {t("PublicBooking.manage")}
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </PublicBookingFrame>
    );
  }

  return (
    <PublicBookingFrame
      aside={
        <BookingSummary
          description={page.description}
          durationMinutes={page.durationMinutes}
          hostName={page.hostName}
          team={page.team}
          title={page.title}
          when={slot ? when(slot.startsAt) : null}
          withVideo={page.withVideo}
          workspaceName={page.workspaceName}
        />
      }
      preview={readOnly}
    >
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
        <div className={slot ? "hidden" : undefined}>
          <BookingSlotPicker
            horizonDays={page.horizonDays}
            loadingMore={loadingMore}
            selected={slot}
            slots={slots}
            timeZone={timeZone}
            onMonth={showMonth}
            onSelect={setSlot}
          />
        </div>
      ) : null}

      {slot ? (
        <SlotForm readOnly={readOnly} onSubmit={(event) => runUserAction(() => submit(event))}>
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

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              data-booking-back=""
              disabled={submitting}
              type="button"
              variant="ghost"
              onClick={() => setSlot(null)}
            >
              <ArrowLeft aria-hidden className="size-4" />

              {t("Common.actions.back")}
            </Button>

            <Button disabled={submitting || readOnly} type="submit">
              {submitting ? <Spinner aria-label={t("Loading.text")} className="size-4" /> : null}

              {t("PublicBooking.confirm")}
            </Button>
          </div>
        </SlotForm>
      ) : null}
    </PublicBookingFrame>
  );
}
