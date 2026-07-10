import type { Data, Validated } from "@/core/validation/validation.utils";

import type { CalendarEventDto } from "./calendar.schema";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CalendarEventDtoSchema } from "./calendar.schema";

export const GetCalendarEventByIdSchema = z.object({ id: z.uuid() });
type GetCalendarEventByIdData = Data<typeof GetCalendarEventByIdSchema>;

export abstract class GetCalendarEventByIdRepo {
  abstract getCalendarEventById(id: string): Promise<CalendarEventDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetCalendarEventByIdInteractor extends AuthenticatedInteractor<
  GetCalendarEventByIdData,
  CalendarEventDto | null
> {
  constructor(private repo: GetCalendarEventByIdRepo) {
    super();
  }

  @Validate(GetCalendarEventByIdSchema)
  @ValidateOutput(CalendarEventDtoSchema.nullable())
  async invoke(data: GetCalendarEventByIdData): Validated<CalendarEventDto | null> {
    const event = await this.repo.getCalendarEventById(data.id);
    return { ok: true as const, data: event };
  }
}
