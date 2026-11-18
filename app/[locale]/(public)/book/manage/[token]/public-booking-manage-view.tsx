"use client";

import type { PublicManagedBooking } from "@/ee/calendar/booking.schema";
import type { BookingSlot } from "../../[token]/booking-slot-pages";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, CalendarCheck, CalendarX } from "lucide-react";

import {
  cancelPublicBookingAction,
  readPublicBookingManageSlotsAction,
  reschedulePublicBookingAction,
} from "../../[token]/actions";
import { type BookingSlotReader, BookingSlotPicker, useBookingSlots } from "../../[token]/booking-slot-picker";
import { BookingSummary, PublicBookingFrame, useBookingWhen } from "../../[token]/public-booking-view";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";
import { browserTimeZone } from "@/core/utils/time-zone";
import { IntlLink } from "@/i18n/navigation";

type Mode = "overview" | "cancel" | "reschedule";
type Outcome = { kind: "cancelled" } | { kind: "rescheduled"; startsAt: string };
type Problem = "slotTaken" | "notAllowed" | "unavailable" | "rateLimited";

const SLOT_DAYS = 31;
const REASON_MAX_CHARS = 500;

export function PublicBookingManageView({
  booking,
  manageToken,
}: {
  booking: PublicManagedBooking;
  manageToken: string;
}) {
  const t = useTranslations();
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("overview");
  const [reason, setReason] = useState("");
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const when = useBookingWhen(timeZone);
  const read = useCallback<BookingSlotReader>(
    (from) => readPublicBookingManageSlotsAction({ manageToken, days: SLOT_DAYS, ...(from ? { from } : {}) }),
    [manageToken],
  );
  const { slots, loadFailed, loadingMore, reload, showMonth } = useBookingSlots(mode === "reschedule" ? read : null);

  useEffect(() => setTimeZone(browserTimeZone()), []);

  const startsAt = outcome?.kind === "rescheduled" ? outcome.startsAt : booking.startsAt;
  const state = outcome?.kind === "cancelled" ? "cancelled" : booking.state;
  const summary = (
    <BookingSummary
      durationMinutes={booking.durationMinutes}
      hostName={booking.hostName}
      title={booking.title}
      when={timeZone ? when(mode === "reschedule" && slot ? slot.startsAt : startsAt) : null}
      workspaceName={booking.workspaceName}
    />
  );

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await cancelPublicBookingAction({ manageToken, reason });
      if (result.status === "cancelled") {
        setOutcome({ kind: "cancelled" });
        setMode("overview");
      } else setProblem(result.status);
    } catch {
      setProblem("unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    if (busy || !slot || !timeZone) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await reschedulePublicBookingAction({ manageToken, startsAt: slot.startsAt, timeZone });
      if (result.status === "rescheduled") {
        setOutcome({ kind: "rescheduled", startsAt: result.startsAt });
        setSlot(null);
        setMode("overview");
      } else {
        setProblem(result.status);
        if (result.status === "slotTaken") {
          setSlot(null);
          await reload();
        }
      }
    } catch {
      setProblem("unavailable");
    } finally {
      setBusy(false);
    }
  }

  const problemAlert = problem ? (
    <Alert
      description={
        problem === "slotTaken"
          ? t("PublicBooking.problem.slotTaken")
          : problem === "notAllowed"
            ? t("PublicBooking.manageNotAllowed")
            : problem === "rateLimited"
              ? t("PublicBooking.problem.rateLimited")
              : t("PublicBooking.manageFailed")
      }
      role="alert"
      variant="warning"
    />
  ) : null;

  if (mode === "reschedule") {
    return (
      <PublicBookingFrame aside={summary}>
        <h2 className="text-sm font-medium">{t("PublicBooking.rescheduleTitle")}</h2>

        {loadFailed ? <Alert description={t("PublicBooking.loadFailed")} role="alert" variant="destructive" /> : null}

        {problemAlert}

        {slots === null && !loadFailed ? (
          <div className="flex justify-center py-8">
            <Spinner aria-label={t("Loading.text")} className="size-5" />
          </div>
        ) : null}

        {slots && !slots.length && !loadFailed ? (
          <p className="text-sm text-muted-foreground">{t("PublicBooking.noOtherSlots")}</p>
        ) : null}

        {slots?.length && timeZone ? (
          <BookingSlotPicker
            horizonDays={booking.horizonDays}
            loadingMore={loadingMore}
            selected={slot}
            slots={slots}
            timeZone={timeZone}
            onMonth={showMonth}
            onSelect={setSlot}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            disabled={busy}
            type="button"
            variant="ghost"
            onClick={() => {
              setMode("overview");
              setSlot(null);
              setProblem(null);
            }}
          >
            <ArrowLeft aria-hidden className="size-4" />

            {t("Common.actions.back")}
          </Button>

          <Button
            data-booking-reschedule-confirm=""
            disabled={busy || !slot}
            type="button"
            onClick={() => runUserAction(reschedule)}
          >
            {busy ? <Spinner aria-label={t("Loading.text")} className="size-4" /> : null}

            {t("PublicBooking.rescheduleConfirm")}
          </Button>
        </div>
      </PublicBookingFrame>
    );
  }

  return (
    <PublicBookingFrame>
      <div className="flex flex-col gap-4" data-booking-manage={state}>
        {state === "cancelled" ? (
          <CalendarX aria-hidden className="size-8 text-muted-foreground" />
        ) : (
          <CalendarCheck aria-hidden className="size-8 text-success" />
        )}

        <div className="flex flex-col gap-3">{summary}</div>

        {outcome?.kind === "cancelled" ? (
          <Alert description={t("PublicBooking.cancelledText")} role="status" variant="info" />
        ) : null}

        {outcome?.kind === "rescheduled" ? (
          <Alert description={t("PublicBooking.rescheduledText")} role="status" variant="success" />
        ) : null}

        {!outcome && state === "cancelled" ? (
          <p className="text-sm text-muted-foreground">{t("PublicBooking.stateCancelled")}</p>
        ) : null}

        {state === "past" ? <p className="text-sm text-muted-foreground">{t("PublicBooking.statePast")}</p> : null}

        {state === "upcoming" && !booking.canCancel ? (
          <p className="text-sm text-muted-foreground">{t("PublicBooking.changesOff", { host: booking.hostName })}</p>
        ) : null}

        {problemAlert}

        {mode === "cancel" ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4" data-booking-cancel-form="">
            <div className="space-y-1.5">
              <Label htmlFor="booking-cancel-reason">{t("PublicBooking.cancelReason")}</Label>

              <Textarea
                disabled={busy}
                id="booking-cancel-reason"
                maxLength={REASON_MAX_CHARS}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button disabled={busy} type="button" variant="ghost" onClick={() => setMode("overview")}>
                {t("PublicBooking.keep")}
              </Button>

              <Button
                data-booking-cancel-confirm=""
                disabled={busy}
                type="button"
                variant="destructive"
                onClick={() => runUserAction(cancel)}
              >
                {busy ? <Spinner aria-label={t("Loading.text")} className="size-4" /> : null}

                {t("PublicBooking.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "overview" ? (
          <div className="flex flex-wrap items-center gap-2">
            {state === "upcoming" && booking.canReschedule ? (
              <Button data-booking-reschedule="" type="button" onClick={() => setMode("reschedule")}>
                {t("PublicBooking.reschedule")}
              </Button>
            ) : null}

            {state === "upcoming" && booking.canCancel ? (
              <Button data-booking-cancel="" type="button" variant="secondary" onClick={() => setMode("cancel")}>
                {t("PublicBooking.cancel")}
              </Button>
            ) : null}

            {state !== "upcoming" && booking.bookAgainToken ? (
              <Button asChild variant="secondary">
                <IntlLink href={`/book/${booking.bookAgainToken}`}>{t("PublicBooking.bookAgain")}</IntlLink>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </PublicBookingFrame>
  );
}
