"use server";

import type {
  BookingLinkIdData,
  CancelHostedBookingInput,
  HostedBookingSlotsQueryInput,
  RescheduleHostedBookingData,
  SaveBookingLinkInput,
} from "@/ee/calendar/booking.schema";

import {
  getCancelHostedBookingInteractor,
  getDeleteBookingLinkInteractor,
  getGetHostedBookingSlotsInteractor,
  getRescheduleHostedBookingInteractor,
  getSaveBookingLinkInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function saveBookingLinkAction(input: SaveBookingLinkInput) {
  return serializeResult(getSaveBookingLinkInteractor().invoke(input as never));
}

export async function deleteBookingLinkAction(input: BookingLinkIdData) {
  return serializeResult(getDeleteBookingLinkInteractor().invoke(input));
}

export async function readHostedBookingSlotsAction(input: HostedBookingSlotsQueryInput) {
  return serializeResult(getGetHostedBookingSlotsInteractor().invoke(input as never));
}

export async function cancelHostedBookingAction(input: CancelHostedBookingInput) {
  return serializeResult(getCancelHostedBookingInteractor().invoke(input as never));
}

export async function rescheduleHostedBookingAction(input: RescheduleHostedBookingData) {
  return serializeResult(getRescheduleHostedBookingInteractor().invoke(input));
}
