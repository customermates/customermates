import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { CalendarDto } from "./calendar.schema";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CalendarDtoSchema } from "./calendar.schema";

export const GetCalendarByIdSchema = z.object({ id: z.uuid() });
type GetCalendarByIdData = Data<typeof GetCalendarByIdSchema>;

export abstract class GetCalendarByIdRepo {
  abstract getCalendarById(id: string): Promise<CalendarDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetCalendarByIdInteractor extends AuthenticatedInteractor<GetCalendarByIdData, CalendarDto | null> {
  constructor(
    private repo: GetCalendarByIdRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(GetCalendarByIdSchema)
  @ValidateOutput(CalendarDtoSchema.nullable())
  async invoke(data: GetCalendarByIdData): Validated<CalendarDto | null> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const calendar = await this.repo.getCalendarById(data.id);
    return { ok: true as const, data: calendar };
  }
}
