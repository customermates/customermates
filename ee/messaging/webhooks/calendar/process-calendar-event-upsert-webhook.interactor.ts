import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { CalendarWriteRepo } from "@/ee/calendar/calendar-write.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";
import { buildCalendarEvent, collectAttendeeEmails } from "@/ee/calendar/calendar-normalize";
import { UnipileCalendarEventSchema } from "../../unipile.schema";
import { UnmappableWebhookPayloadError } from "@/core/errors/app-errors";

const Schema = z.object({
  type: z.enum(["calendar.event.new", "calendar.event.update"]),
  account_id: z.string(),
  payload: UnipileCalendarEventSchema.extend({ calendar_id: z.string() }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessCalendarEventUpsertWebhookInteractor {
  constructor(
    private calendarRepo: CalendarWriteRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const normalized = buildCalendarEvent(envelope.payload);
    if (!normalized) throw new UnmappableWebhookPayloadError(envelope.payload.id || null);

    const calendar = await this.calendarRepo.findOrCreateCalendarByUnipileIdUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileCalendarId: envelope.payload.calendar_id,
      name: "(Unnamed calendar)",
      timezone: normalized.timezone,
    });

    if (!account.hasCalendar) await this.accountRepo.markAccountHasCalendarUnscoped(account.unipileAccountId);

    const event = await this.calendarRepo.upsertCalendarEventUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      calendarId: calendar.id,
      event: normalized,
      attendeeEmails: collectAttendeeEmails(normalized),
    });

    await this.eventService.publish(
      DomainEvent.MESSAGING_CALENDAR_EVENT_CHANGED,
      {
        entityId: event.id,
        payload: {
          connectedAccountId: account.id,
          providerCalendarId: envelope.payload.calendar_id,
          providerEventId: envelope.payload.id,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
