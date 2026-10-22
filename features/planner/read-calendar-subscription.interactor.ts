import type { Validated } from "@/core/validation/validation.utils";

import { z as schema } from "zod";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { addCalendarDays } from "@/features/record-calendar/calendar-date";
import { zonedDate } from "@/features/record-calendar/zoned-time";

import type { CalendarSubscriptionTenant } from "./calendar-subscription-tenant";
import type { ExportPlannerInteractor } from "./export-planner.interactor";
@SystemInteractor
export class ReadCalendarSubscriptionInteractor {
  constructor(
    private tenant: CalendarSubscriptionTenant,
    private exporter: ExportPlannerInteractor,
  ) {}
  @Validate(schema.object({ token: schema.string().regex(/^[\w-]{43}$/u) }).strict())
  async invoke({ token }: { token: string }): Validated<string | null> {
    return this.tenant.run(token, async (subscription) => {
      const today = zonedDate(new Date(), subscription.config.timeZone);
      return this.exporter.invoke({
        config: subscription.config,
        includePersonalEvents: subscription.includePersonalEvents,
        window: { from: addCalendarDays(today, -30), to: addCalendarDays(today, 335) },
      });
    });
  }
}
