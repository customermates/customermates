import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { publicBrand } from "@/features/workspace-brand/workspace-brand.schema";

import type { PublicFormQuota } from "@/features/public-form/public-form-quota";
import type { OpenBooking, PublicBookingAccess } from "./public-booking-access";

import {
  type PublicBookingManageResult,
  type PublicBookingState,
  PublicBookingManageQuerySchema,
} from "./booking.schema";
import { PUBLIC_BOOKING_UNAVAILABLE } from "./public-booking-access";

export function managedBookingState({ booking }: Pick<OpenBooking, "booking">, now: Date): PublicBookingState {
  if (booking.status === "cancelled") return "cancelled";

  return booking.startsAt <= now ? "past" : "upcoming";
}

export function inviteeMayCancel(opened: OpenBooking, now: Date): boolean {
  return opened.link.inviteeChanges && managedBookingState(opened, now) === "upcoming";
}

export function inviteeMayReschedule(opened: OpenBooking, now: Date): boolean {
  return inviteeMayCancel(opened, now) && opened.link.enabled && opened.host !== null;
}

@SystemInteractor
export class ReadPublicBookingManageInteractor {
  constructor(
    private access: PublicBookingAccess,
    private quota: PublicFormQuota,
  ) {}

  async invoke(input: unknown): Promise<PublicBookingManageResult> {
    const query = PublicBookingManageQuerySchema.safeParse(input);
    if (!query.success) return PUBLIC_BOOKING_UNAVAILABLE;

    return this.access.openBooking(
      query.data.manageToken,
      query.data.visitor,
      async (opened): Promise<PublicBookingManageResult> => {
        const { booking, link } = opened;
        const now = this.access.now();
        const cancelledByHost = booking.status === "cancelled" && booking.cancelledBy === "host";

        return {
          status: "found",
          booking: {
            title: link.title,
            hostName: booking.hostName,
            workspaceName: link.workspaceName,
            inviteeName: booking.inviteeName,
            startsAt: booking.startsAt.toISOString(),
            endsAt: booking.endsAt.toISOString(),
            durationMinutes: link.durationMinutes,
            horizonDays: link.horizonDays,
            state: managedBookingState(opened, now),
            cancelledByHost,
            cancelReason: cancelledByHost ? booking.cancelReason : null,
            canCancel: inviteeMayCancel(opened, now),
            canReschedule: inviteeMayReschedule(opened, now),
            bookAgainToken: link.enabled ? link.token : null,
            brand: publicBrand(link.brand),
            badge: (await this.quota.limits(booking.companyId)).badge,
          },
        };
      },
    );
  }
}
