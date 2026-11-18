"use server";

import type {
  PublicBookingCancelResult,
  PublicBookingRescheduleResult,
  PublicBookingSlotsResult,
  PublicBookingSubmitResult,
  SubmitPublicBookingInput,
} from "@/ee/calendar/booking.schema";

import { getTranslations } from "next-intl/server";

import {
  getCancelPublicBookingInteractor,
  getReadPublicBookingManageSlotsInteractor,
  getReadPublicBookingSlotsInteractor,
  getReschedulePublicBookingInteractor,
  getSubmitPublicBookingInteractor,
} from "@/core/di";
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
  const t = await getTranslations();

  return getSubmitPublicBookingInteractor().invoke(
    { ...input, visitor: await visitorKey() },
    { manageLine: t("PublicBooking.manageLine") },
  );
}

export async function readPublicBookingManageSlotsAction(input: {
  manageToken: string;
  from?: string;
  days?: number;
}): Promise<PublicBookingSlotsResult> {
  return getReadPublicBookingManageSlotsInteractor().invoke({ ...input, visitor: await visitorKey() });
}

export async function cancelPublicBookingAction(input: {
  manageToken: string;
  reason: string;
}): Promise<PublicBookingCancelResult> {
  return getCancelPublicBookingInteractor().invoke({ ...input, visitor: await visitorKey() });
}

export async function reschedulePublicBookingAction(input: {
  manageToken: string;
  startsAt: string;
  timeZone: string;
}): Promise<PublicBookingRescheduleResult> {
  return getReschedulePublicBookingInteractor().invoke({ ...input, visitor: await visitorKey() });
}
