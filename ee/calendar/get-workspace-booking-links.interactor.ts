import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import type { BookingLinkRepo } from "./booking-link.repo";

import { type WorkspaceBookingLinkList, WorkspaceBookingLinkListSchema } from "./booking.schema";
import { toBookingLinkDto } from "./booking-link-dto";

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetWorkspaceBookingLinksInteractor extends AuthenticatedInteractor<void, WorkspaceBookingLinkList> {
  constructor(
    private repo: BookingLinkRepo,
    private entitlements: EntitlementService,
    private baseUrl: string,
  ) {
    super();
  }

  @ValidateOutput(WorkspaceBookingLinkListSchema)
  async invoke(): Validated<WorkspaceBookingLinkList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const own = `${this.user.firstName} ${this.user.lastName}`.trim();
    const rows = this.user.role?.isSystemRole
      ? await this.repo.listWorkspace()
      : (await this.repo.list()).map((row) => ({ ...row, ownerName: own }));

    return {
      ok: true as const,
      data: {
        items: rows.map((row) => ({
          ...toBookingLinkDto(row, this.baseUrl),
          ownerName: row.ownerName,
          own: row.userId === this.user.id,
        })),
      },
    };
  }
}
