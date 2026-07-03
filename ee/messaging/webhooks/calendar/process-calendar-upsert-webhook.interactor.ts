import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { CalendarWriteRepo } from "@/ee/calendar/calendar-write.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";
import { UnipileCalendarSchema } from "../../unipile.schema";

const Schema = z.object({
  type: z.enum(["calendar.create", "calendar.update"]),
  account_id: z.string(),
  payload: UnipileCalendarSchema,
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessCalendarUpsertWebhookInteractor {
  constructor(
    private calendarRepo: CalendarWriteRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    await this.calendarRepo.upsertCalendarUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileCalendarId: envelope.payload.id,
      name: envelope.payload.name ?? "(Unnamed calendar)",
      description: envelope.payload.description ?? null,
      color: envelope.payload.background_color ?? envelope.payload.color ?? null,
      timezone: envelope.payload.timezone ?? null,
    });

    await this.eventService.publish(
      DomainEvent.MESSAGING_CALENDAR_CHANGED,
      {
        entityId: envelope.payload.id,
        payload: {
          connectedAccountId: account.id,
          providerCalendarId: envelope.payload.id,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
