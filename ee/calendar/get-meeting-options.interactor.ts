import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import type { CalendarWriteAccessRepo } from "./calendar-write-access.repo";
import type { MeetingRecordService } from "./meeting-record.service";

import {
  type MeetingOptions,
  type MeetingOptionsQuery,
  MeetingOptionsQuerySchema,
  MeetingOptionsSchema,
} from "./meeting.schema";

@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetMeetingOptionsInteractor extends AuthenticatedInteractor<MeetingOptionsQuery, MeetingOptions> {
  constructor(
    private access: CalendarWriteAccessRepo,
    private records: MeetingRecordService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(MeetingOptionsQuerySchema)
  @ValidateOutput(MeetingOptionsSchema)
  async invoke(query: MeetingOptionsQuery = {}): Validated<MeetingOptions> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const own = await this.access.listOwnCalendars();
    const model = await this.records.loadModel();
    const attendees = model && query.record ? await this.records.suggestAttendees(query.record, model) : [];

    return {
      ok: true as const,
      data: {
        calendars: own.calendars.map((calendar) => ({
          id: calendar.id,
          name: calendar.name,
          provider: calendar.provider,
          timeZone: calendar.timezone,
          accountLabel: calendar.accountLabel,
        })),
        attendees,
        actionLists: model ? this.records.actionLists(model) : [],
        blockedReason: own.calendars.length
          ? null
          : own.accountsNeedingReconnect > 0
            ? ("needsReconnect" as const)
            : ("noCalendar" as const),
      },
    };
  }
}
