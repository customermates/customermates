import type { PublicBookingPage } from "@/ee/calendar/booking.schema";
import type { BookingSetup } from "@/ee/calendar/booking-setup";
import type { BookingLinkForm } from "../../../settings/(account)/components/booking-link-modal.store";

import { computeFreeSlots, type FreeSlot } from "@/ee/calendar/free-slots";

export const BOOKING_PREVIEW_DAYS = 14;
const DAY_MS = 86_400_000;
const PREVIEW_SLOT_LIMIT = 200;

export function bookingPreviewPage(
  form: BookingLinkForm,
  setup: BookingSetup,
  hostName: string,
  fallbackTitle: string,
): PublicBookingPage {
  const list = setup.lists.find((item) => item.id === form.recordTypeId);
  const questions = form.recordTypeId
    ? form.questions.flatMap((entry) => {
        const field = list?.questionFields.find((item) => item.id === entry.fieldId);
        if (!field?.question) return [];
        return [
          {
            ...field.question,
            label: entry.label ?? field.label,
            required: entry.required || field.question.required,
          },
        ];
      })
    : [];

  return {
    title: form.title.trim() || fallbackTitle,
    description: form.description.trim() || null,
    durationMinutes: form.durationMinutes,
    horizonDays: form.horizonDays,
    timeZone: form.timeZone,
    workspaceName: null,
    hostName,
    team: form.assignment === "roundRobin" && form.hostUserIds.length > 0,
    withVideo: form.withVideo,
    questions,
    renderToken: "",
  };
}

export function bookingPreviewSlots(form: BookingLinkForm, now: Date): FreeSlot[] {
  if (!form.timeZone) return [];
  try {
    return computeFreeSlots({
      rules: {
        workingHours: form.workingHours,
        timeZone: form.timeZone,
        durationMinutes: form.durationMinutes,
        bufferMinutes: form.bufferMinutes,
        minNoticeMinutes: form.minNoticeMinutes,
        horizonDays: form.horizonDays,
        stepMinutes: Math.min(30, form.durationMinutes),
      },
      now,
      busy: [],
      to: new Date(now.getTime() + BOOKING_PREVIEW_DAYS * DAY_MS),
      limit: PREVIEW_SLOT_LIMIT,
    });
  } catch {
    return [];
  }
}
