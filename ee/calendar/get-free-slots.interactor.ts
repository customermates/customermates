import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import type { BusyTimeReader } from "./busy-time.reader";

import { computeFreeSlots } from "./free-slots";
import { type FreeSlots, type FreeSlotsQuery, FreeSlotsQuerySchema, FreeSlotsSchema } from "./meeting.schema";
import { DEFAULT_WORKING_HOURS } from "./working-hours";

const DAY_MS = 86_400_000;
const SLOT_STEP_MINUTES = 30;
const SLOT_LIMIT = 300;

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetFreeSlotsInteractor extends AuthenticatedInteractor<FreeSlotsQuery, FreeSlots> {
  constructor(
    private busy: BusyTimeReader,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(FreeSlotsQuerySchema)
  @ValidateOutput(FreeSlotsSchema)
  async invoke(query: FreeSlotsQuery): Validated<FreeSlots> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const now = new Date();
    const from = query.from && new Date(query.from) > now ? new Date(query.from) : now;
    const to = new Date(from.getTime() + query.days * DAY_MS);
    const busy = await this.busy.read(from, to, query.timeZone);

    return {
      ok: true as const,
      data: {
        timeZone: query.timeZone,
        slots: computeFreeSlots({
          rules: {
            workingHours: query.workingHours ?? DEFAULT_WORKING_HOURS,
            timeZone: query.timeZone,
            durationMinutes: query.durationMinutes,
            bufferMinutes: query.bufferMinutes,
            minNoticeMinutes: 0,
            horizonDays: query.days,
            stepMinutes: SLOT_STEP_MINUTES,
          },
          now: from,
          busy,
          limit: SLOT_LIMIT,
        }),
      },
    };
  }
}
