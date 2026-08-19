import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { CalendarWriteRepo } from "@/ee/calendar/calendar-write.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({
  type: z.literal("calendar.event.delete"),
  account_id: z.string(),
  payload: z.looseObject({ id: z.string(), calendar_id: z.string() }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessCalendarEventDeleteWebhookInteractor {
  constructor(
    private calendarRepo: CalendarWriteRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const event = await this.calendarRepo.deleteCalendarEventUnscoped({
      connectedAccountId: account.id,
      unipileEventId: envelope.payload.id,
    });
    if (!event) return;

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
