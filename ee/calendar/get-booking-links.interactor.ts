import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import type { BookingLinkRepo } from "./booking-link.repo";

import { type BookingLinkList, BookingLinkListSchema } from "./booking.schema";
import { toBookingLinkDto } from "./booking-link-dto";

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetBookingLinksInteractor extends AuthenticatedInteractor<void, BookingLinkList> {
  constructor(
    private repo: BookingLinkRepo,
    private entitlements: EntitlementService,
    private baseUrl: string,
  ) {
    super();
  }

  @ValidateOutput(BookingLinkListSchema)
  async invoke(): Validated<BookingLinkList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const rows = await this.repo.list();

    return { ok: true as const, data: { items: rows.map((row) => toBookingLinkDto(row, this.baseUrl)) } };
  }
}
