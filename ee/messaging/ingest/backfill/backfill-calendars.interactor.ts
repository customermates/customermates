import type { MessagingService } from "../../messaging.service";
import type { ConnectedAccount } from "../../messaging.schema";
import type { BackfillConnectedAccountRepo } from "./backfill.repo";

import { z } from "zod";

import * as Sentry from "@sentry/node";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { buildCalendarEvent, collectAttendeeEmails } from "@/ee/calendar/calendar-normalize";
import type { CalendarWriteRepo } from "@/ee/calendar/calendar-write.repo";
import { UnipileCalendarEventSchema, UnipileCalendarSchema } from "@/ee/messaging/unipile.schema";
import { BackfillCheckpointSchema } from "./backfill-checkpoint.schema";

import { BACKFILL_MAX_MESSAGES, UNIPILE_MAX_LIMIT, paginateNested } from "./paginate";

const BackfillCalendarsPayloadSchema = z.object({
  account: z.custom<ConnectedAccount>(),
  afterDate: z.date(),
  checkpoint: BackfillCheckpointSchema,
  epoch: z.number(),
});
export type BackfillCalendarsPayload = z.infer<typeof BackfillCalendarsPayloadSchema>;

@SystemInteractor
export class BackfillCalendarsInteractor {
  constructor(
    private repo: BackfillConnectedAccountRepo,
    private messagingService: MessagingService,
    private calendarRepo: CalendarWriteRepo,
  ) {}

  @Enforce(BackfillCalendarsPayloadSchema)
  async invoke({ account, afterDate, checkpoint, epoch }: BackfillCalendarsPayload): Promise<void> {
    if (checkpoint.calendar?.done) return;

    const start = afterDate.toISOString();

    const { processed, sawOuter } = await paginateNested<{ unipileCalendarId: string; calendarId: string }>({
      startCursor: checkpoint.calendar?.cursor ?? undefined,
      fetchOuterPage: (cursor) =>
        this.messagingService.listCalendars({
          accountId: account.unipileAccountId,
          cursor,
          limit: UNIPILE_MAX_LIMIT,
        }),
      mapOuter: (rawCalendar) => this.upsertCalendar(account, rawCalendar),
      fetchInnerPage: (calendar, cursor) =>
        this.messagingService.listCalendarEvents({
          accountId: account.unipileAccountId,
          calendarId: calendar.unipileCalendarId,
          cursor,
          limit: UNIPILE_MAX_LIMIT,
          start,
          expandRecurring: true,
        }),
      handleInner: (calendar, rawEvent) => this.processCalendarEvent(account, calendar.calendarId, rawEvent),
      onOuterPageEnd: (cursor) =>
        this.repo.saveBackfillStepCheckpoint({
          unipileAccountId: account.unipileAccountId,
          step: "calendar",
          checkpoint: { cursor },
          epoch,
        }),
    });

    if (sawOuter) await this.repo.markAccountHasCalendar(account.unipileAccountId);

    const exhausted = processed < BACKFILL_MAX_MESSAGES;
    const sawCalendarsButNoEventsYet = sawOuter && processed === 0;
    if (exhausted && !sawCalendarsButNoEventsYet) {
      await this.repo.saveBackfillStepCheckpoint({
        unipileAccountId: account.unipileAccountId,
        step: "calendar",
        checkpoint: { done: true },
        epoch,
      });
    }
  }

  private async upsertCalendar(
    account: ConnectedAccount,
    rawCalendar: unknown,
  ): Promise<{ unipileCalendarId: string; calendarId: string } | null> {
    const parsed = UnipileCalendarSchema.safeParse(rawCalendar);

    if (!parsed.success) {
      await this.repo.recordUnusableItem({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawCalendar,
      });
      return null;
    }

    const stored = await this.calendarRepo.upsertCalendar({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileCalendarId: parsed.data.id,
      name: parsed.data.name ?? "(Unnamed calendar)",
      description: parsed.data.description ?? null,
      color: parsed.data.background_color ?? null,
      timezone: parsed.data.timezone ?? null,
    });

    return { unipileCalendarId: parsed.data.id, calendarId: stored.id };
  }

  private async processCalendarEvent(
    account: ConnectedAccount,
    calendarId: string,
    rawEvent: unknown,
  ): Promise<number> {
    const parsed = UnipileCalendarEventSchema.safeParse(rawEvent);

    if (!parsed.success) {
      await this.repo.recordUnusableItem({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: rawEvent,
      });
      return 1;
    }

    const normalized = buildCalendarEvent(parsed.data);

    if (!normalized) {
      await this.repo.recordUnusableItem({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: parsed.data,
        unipileMessageId: parsed.data.id ?? null,
      });
      return 1;
    }

    try {
      await this.calendarRepo.upsertCalendarEvent({
        companyId: account.companyId,
        connectedAccountId: account.id,
        calendarId,
        event: normalized,
        attendeeEmails: collectAttendeeEmails(normalized),
      });
    } catch (err) {
      Sentry.captureException(err);
      await this.repo.recordUnusableItem({
        companyId: account.companyId,
        connectedAccountId: account.id,
        payload: normalized,
        unipileMessageId: parsed.data.id ?? null,
      });
    }

    return 1;
  }
}
