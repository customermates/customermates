"use server";

import type { BookingLinkIdData, SaveBookingLinkInput } from "@/ee/calendar/booking.schema";

import { getDeleteBookingLinkInteractor, getSaveBookingLinkInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function saveBookingLinkAction(input: SaveBookingLinkInput) {
  return serializeResult(getSaveBookingLinkInteractor().invoke(input as never));
}

export async function deleteBookingLinkAction(input: BookingLinkIdData) {
  return serializeResult(getDeleteBookingLinkInteractor().invoke(input));
}
