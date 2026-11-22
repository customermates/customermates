"use client";

import type { BookingSlot } from "@/app/[locale]/(public)/book/[token]/booking-slot-pages";
import type { UpcomingBookingDto } from "@/ee/calendar/booking.schema";

import { useCallback, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, CalendarX } from "lucide-react";
import { toast } from "sonner";

import {
  cancelHostedBookingAction,
  readHostedBookingSlotsAction,
  rescheduleHostedBookingAction,
} from "../../booking-actions";

import {
  type BookingSlotReader,
  BookingSlotPicker,
  useBookingSlots,
} from "@/app/[locale]/(public)/book/[token]/booking-slot-picker";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Alert } from "@/components/shared/alert";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ItemActionsTrigger } from "@/components/ui/item-actions";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { browserTimeZone } from "@/core/utils/time-zone";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { BOOKING_CANCEL_REASON_MAX_CHARS } from "@/ee/calendar/booking.schema";

type Props = {
  booking: UpcomingBookingDto;
  horizonDays: number;
  onChanged: () => void;
};

const SLOT_DAYS = 31;

function BookingRescheduleDialog({ booking, horizonDays, onChanged, onClose }: Props & { onClose: () => void }) {
  const t = useTranslations();
  const [timeZone] = useState(browserTimeZone);
  const [slot, setSlot] = useState<BookingSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const read = useCallback<BookingSlotReader>(
    async (from) => {
      const result = await readHostedBookingSlotsAction({ id: booking.id, days: SLOT_DAYS, ...(from ? { from } : {}) });
      return result.ok ? { status: "available", ...result.data } : { status: "unavailable" };
    },
    [booking.id],
  );
  const { slots, loadFailed, loadingMore, reload, showMonth } = useBookingSlots(read);
  const title = t("Booking.hostActions.rescheduleTitle", { name: booking.inviteeName });

  async function move() {
    if (busy || !slot) return;
    setBusy(true);
    try {
      const result = await rescheduleHostedBookingAction({ id: booking.id, startsAt: slot.startsAt });
      if (result.ok) {
        toast.success(t("Booking.hostActions.rescheduled", { name: booking.inviteeName }));
        onChanged();
        onClose();
        return;
      }
      toastZodErrorTree(result.error);
      setSlot(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal open titleInContent size="lg" title={title} onClose={onClose}>
      <AppCard data-booking-host-reschedule-dialog="">
        <AppCardHeader>
          <AppModalTitle className="min-w-0 break-words text-base font-semibold">{title}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody>
          {loadFailed ? (
            <Alert description={t("Booking.hostActions.loadFailed")} role="alert" variant="destructive" />
          ) : null}

          {slots === null && !loadFailed ? (
            <div className="flex justify-center py-8">
              <Spinner aria-label={t("Loading.text")} className="size-5" />
            </div>
          ) : null}

          {slots && !slots.length && !loadFailed ? (
            <p className="text-sm text-muted-foreground">{t("Booking.hostActions.noSlots")}</p>
          ) : null}

          {slots?.length ? (
            <BookingSlotPicker
              horizonDays={horizonDays}
              loadingMore={loadingMore}
              selected={slot}
              slots={slots}
              timeZone={timeZone}
              onMonth={showMonth}
              onSelect={setSlot}
            />
          ) : null}
        </AppCardBody>

        <FormFooterActions
          anchorScope="booking-host-reschedule"
          dirty={Boolean(slot)}
          saveLabel={t("Booking.hostActions.rescheduleConfirm")}
          saving={busy}
          store={null}
          onCancel={onClose}
          onSave={move}
        />
      </AppCard>
    </AppModal>
  );
}

export function BookingHostActions({
  booking,
  horizonDays,
  onChanged,
  disabled = false,
}: Props & { disabled?: boolean }) {
  const t = useTranslations();
  const reasonId = useId();
  const [mode, setMode] = useState<"cancel" | "reschedule" | null>(null);
  const [reason, setReason] = useState("");
  const name = booking.inviteeName;

  async function cancel() {
    const result = await cancelHostedBookingAction({ id: booking.id, reason });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }
    toast.success(t("Booking.hostActions.cancelled", { name }));
    setMode(null);
    onChanged();
  }

  return (
    <span className="flex shrink-0 items-center" data-booking-host-actions={booking.id}>
      <ItemActionsTrigger
        disabled={disabled}
        label={t("Booking.hostActions.menu", { name })}
        menu={
          disabled ? undefined : (
            <>
              <DropdownMenuItem data-booking-host-reschedule="" onSelect={() => setMode("reschedule")}>
                <CalendarClock aria-hidden className="size-4" />

                {t("Booking.hostActions.reschedule")}
              </DropdownMenuItem>

              <DropdownMenuItem data-booking-host-cancel="" variant="destructive" onSelect={() => setMode("cancel")}>
                <CalendarX aria-hidden className="size-4" />

                {t("Booking.hostActions.cancelConfirm")}
              </DropdownMenuItem>
            </>
          )
        }
      />

      <ConfirmDialog
        cancelLabel={t("Booking.hostActions.keep")}
        confirmLabel={t("Booking.hostActions.cancelConfirm")}
        description={t("Booking.hostActions.cancelText", { name })}
        open={mode === "cancel"}
        title={t("Booking.hostActions.cancelTitle", { name })}
        onCancel={() => setMode(null)}
        onConfirm={cancel}
      >
        <div className="space-y-1.5">
          <Label htmlFor={reasonId}>{t("Booking.hostActions.cancelReason", { name })}</Label>

          <Textarea
            data-booking-host-cancel-reason=""
            id={reasonId}
            maxLength={BOOKING_CANCEL_REASON_MAX_CHARS}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      {mode === "reschedule" ? (
        <BookingRescheduleDialog
          booking={booking}
          horizonDays={horizonDays}
          onChanged={onChanged}
          onClose={() => setMode(null)}
        />
      ) : null}
    </span>
  );
}
