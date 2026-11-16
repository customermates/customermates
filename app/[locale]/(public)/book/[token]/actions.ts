"use server";

import type {
  PublicBookingSlotsResult,
  PublicBookingSubmitResult,
  SubmitPublicBookingInput,
} from "@/ee/calendar/booking.schema";

import { getReadPublicBookingSlotsInteractor, getSubmitPublicBookingInteractor } from "@/core/di";
import { visitorKey } from "@/core/network/visitor-key";

export async function readPublicBookingSlotsAction(input: {
  token: string;
  from?: string;
  days?: number;
}): Promise<PublicBookingSlotsResult> {
  return getReadPublicBookingSlotsInteractor().invoke({ ...input, visitor: await visitorKey() });
}

export async function submitPublicBookingAction(
  input: Omit<SubmitPublicBookingInput, "visitor">,
): Promise<PublicBookingSubmitResult> {
  return getSubmitPublicBookingInteractor().invoke({ ...input, visitor: await visitorKey() });
}
