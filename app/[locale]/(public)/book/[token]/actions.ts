"use server";

import type {
  PublicBookingSlotsResult,
  PublicBookingSubmitResult,
  SubmitPublicBookingInput,
} from "@/ee/calendar/booking.schema";

import { getReadPublicBookingSlotsInteractor, getSubmitPublicBookingInteractor } from "@/core/di";
import { env } from "@/env";

import { visitorKey } from "../../p/[token]/visitor-key";

const UNAVAILABLE = { status: "unavailable" } as const;

export async function readPublicBookingSlotsAction(input: {
  token: string;
  from?: string;
  days?: number;
}): Promise<PublicBookingSlotsResult> {
  if (env.APP_MODE !== "cloud") return UNAVAILABLE;
  return getReadPublicBookingSlotsInteractor().invoke({ ...input, visitor: await visitorKey() });
}

export async function submitPublicBookingAction(
  input: Omit<SubmitPublicBookingInput, "visitor">,
): Promise<PublicBookingSubmitResult> {
  if (env.APP_MODE !== "cloud") return UNAVAILABLE;
  return getSubmitPublicBookingInteractor().invoke({ ...input, visitor: await visitorKey() });
}
