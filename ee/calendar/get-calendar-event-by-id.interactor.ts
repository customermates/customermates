import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { CalendarEventDto } from "./calendar.schema";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { CalendarEventDtoSchema } from "./calendar.schema";
import type { GetCalendarEventByIdRepo } from "./get-calendar-event-by-id.repo";

const GetCalendarEventByIdSchema = z.object({ id: z.uuid() });
type GetCalendarEventByIdData = Data<typeof GetCalendarEventByIdSchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetCalendarEventByIdInteractor extends AuthenticatedInteractor<
  GetCalendarEventByIdData,
  CalendarEventDto
> {
  constructor(
    private repo: GetCalendarEventByIdRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(GetCalendarEventByIdSchema)
  @ValidateOutput(CalendarEventDtoSchema)
  async invoke(data: GetCalendarEventByIdData): Validated<CalendarEventDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const event = await this.repo.getCalendarEventById(data.id);
    if (!event) return failNotFound(CustomErrorCode.calendarEventNotFound, ["id"]);
    return { ok: true as const, data: event };
  }
}
