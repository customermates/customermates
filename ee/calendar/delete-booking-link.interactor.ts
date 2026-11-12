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

import {
  type BookingLinkIdData,
  type DeleteBookingLinkResult,
  BookingLinkIdSchema,
  DeleteBookingLinkResultSchema,
} from "./booking.schema";

@TenantInteractor({ resource: Resource.inboxMessages, manage: "delete" })
export class DeleteBookingLinkInteractor extends AuthenticatedInteractor<BookingLinkIdData, DeleteBookingLinkResult> {
  constructor(
    private repo: BookingLinkRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(BookingLinkIdSchema)
  @ValidateOutput(DeleteBookingLinkResultSchema)
  async invoke(data: BookingLinkIdData): Validated<DeleteBookingLinkResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    if (!(await this.repo.delete(data.id))) return failNotFound(CustomErrorCode.bookingLinkNotFound, ["id"]);

    return { ok: true as const, data: { id: data.id, deleted: true as const } };
  }
}
