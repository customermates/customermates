import type { ConnectedAccount } from "../messaging.schema";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildCalendarEvent, collectAttendeeEmails } from "@/ee/calendar/calendar-normalize";
import type { CalendarWriteRepo } from "@/ee/calendar/calendar-write.repo";
import type { CalendarAccountRepo } from "./calendar-account.repo";
import { UnipileCalendarWebhookSchema, type UnipileCalendarWebhook } from "../unipile.schema";

type UnipileCalendarUpsertWebhook = Exclude<UnipileCalendarWebhook, { event: "calendar_event_deleted" }>;

@SystemInteractor
export class ProcessCalendarWebhookInteractor {
  constructor(
    private repo: CalendarWriteRepo,
    private accountRepo: CalendarAccountRepo,
  ) {}

  @Enforce(UnipileCalendarWebhookSchema)
  async invoke(payload: UnipileCalendarWebhook): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(payload.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    if (!account.hasCalendar) await this.accountRepo.markAccountHasCalendar(payload.account_id);

    if (payload.event === "calendar_event_deleted") return this.handleDeleted(account, payload.id);

    return this.handleUpsert(account, payload);
  }

  private async handleDeleted(account: ConnectedAccount, unipileEventId: string): Promise<void> {
    await this.repo.softDeleteCalendarEvent({ connectedAccountId: account.id, unipileEventId });
  }

  private async handleUpsert(account: ConnectedAccount, payload: UnipileCalendarUpsertWebhook): Promise<void> {
    const calendar = await this.repo.findCalendarByUnipileIdOrThrowUnscoped({
      connectedAccountId: account.id,
      unipileCalendarId: payload.calendar_id,
    });

    const event = buildCalendarEvent(payload);

    if (!event) {
      throw new Error(
        `calendar webhook ${payload.event} for account ${payload.account_id} event ${payload.id} has an unparseable start`,
      );
    }

    await this.repo.upsertCalendarEvent({
      companyId: account.companyId,
      connectedAccountId: account.id,
      calendarId: calendar.id,
      event,
      attendeeEmails: collectAttendeeEmails(event),
    });
  }
}
