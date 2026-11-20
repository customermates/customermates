import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { BookingLinkRepo } from "./booking-link.repo";

import { type BookingLinkDto, type BookingLinkIdData, BookingLinkIdSchema, BookingLinkSchema } from "./booking.schema";
import { toBookingLinkDto } from "./booking-link-dto";

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetBookingLinkByIdInteractor extends AuthenticatedInteractor<BookingLinkIdData, BookingLinkDto> {
  constructor(
    private repo: BookingLinkRepo,
    private entitlements: EntitlementService,
    private baseUrl: string,
  ) {
    super();
  }

  @Validate(BookingLinkIdSchema)
  @ValidateOutput(BookingLinkSchema)
  async invoke(data: BookingLinkIdData): Validated<BookingLinkDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const row = await this.repo.find(data.id);
    if (!row) return failNotFound(CustomErrorCode.bookingLinkNotFound, ["id"]);

    return { ok: true as const, data: toBookingLinkDto(row, this.baseUrl) };
  }
}
